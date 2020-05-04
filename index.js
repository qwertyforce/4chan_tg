const axios = require('axios');
const { Telegraf } = require('telegraf')

const {default: PQueue} = require('p-queue');
const queue = new PQueue({concurrency: 1,interval:5000,intervalCap:1});

const bot = new Telegraf("BOT_ID")
const CHANNEL_ID="@CHANNEL_NAME"
const BOARD='boardname' //for example pol

const SFW=require('./SFW.js')
const format_text=require('./format_text.js')(BOARD)

const ARCHIVE_URL="" //https://archive.4plebs.org/_/articles/credits/ 
const BLUR_NSFW=true
const UPDATE_REPLY_COUNTER=true
var Visited=[];
var last_visit=0;

async function add_to_update_reply_counter(msg){
  update_reply_counter_queue.push({
    message_id: msg.message_id,
    text:msg.text
  })
}
function queue_msg_send(text){
  queue.add(async () =>{
    const msg= await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){add_to_update_reply_counter(msg)}
  }).catch((error) => {
    console.log(new Date().toUTCString())
    console.log(error);
  });  
}
//If image/document can't be send by link, we manually upload them to the telegram servers
function queue_doc_via_link_and_msg_send(text,doc_link){
  queue.add(async () =>{
    await bot.telegram.sendDocument(CHANNEL_ID, doc_link)
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){add_to_update_reply_counter(msg)}
  }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
    const img_buffer= await axios.get(doc_link,{responseType: 'arraybuffer' })
    queue_doc_via_buffer_and_msg_send(text,img_buffer.data)
  }); 
}

function queue_doc_via_buffer_and_msg_send(text,doc_buffer){
  queue.add(async () =>{
    await bot.telegram.sendDocument(CHANNEL_ID,{source: doc_buffer,filename: '1.gif'})
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){add_to_update_reply_counter(msg)}
  }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
  }); 
}

function queue_photo_via_link_and_msg_send(text,img_link){
  queue.add(async () =>{
    await bot.telegram.sendPhoto(CHANNEL_ID, img_link)
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){add_to_update_reply_counter(msg)}
   }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
    const img_buffer= await axios.get(img_link,{responseType: 'arraybuffer' })
    queue_photo_via_buffer_and_msg_send(text,img_buffer.data)
  });  
}
function queue_photo_via_buffer_and_msg_send(text,img_buffer){
  queue.add(async () =>{
    await bot.telegram.sendPhoto(CHANNEL_ID,{source: img_buffer})
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){add_to_update_reply_counter(msg)}
   }).catch((error) => {
    console.log(new Date().toUTCString())
    console.log(error);
   });
}

async function startup(){
  function make_visited(no){
    Visited.push(no)
  }
  await get_threads(make_visited)
  console.log("startup done")
}

async function get_threads(fn){
  try {
    const threads= await axios.get(`https://a.4cdn.org/${BOARD}/threads.json`,{headers: { 'If-Modified-Since':  last_visit}})
    last_visit= new Date().toUTCString();
    for (let page of threads.data) {
      for (let thread of page.threads){
        fn(thread.no)
      }
    }
  } catch (error) {
    if(error.response&&error.response.status===304){
      return
    }else{
      console.log(error);
    }
  }
}

async function post_new_thread(thread_num) {
  try{
    if(!Visited.includes(thread_num)){
      // console.log(thread_num)
      const posts = await axios.get(`https://a.4cdn.org/${BOARD}/thread/${thread_num}.json`,{headers: { 'If-Modified-Since':  0}})
      const first_post= posts.data.posts[0]
      // console.log(first_post);
      Visited.push(thread_num)
      // console.log("new thread")
      let text=first_post.com||''
      text=await format_text(text)
      text=`<b>${first_post.sub||''}</b>\n`+text+`\n<b>Thread:</b> https://boards.4channel.org/${BOARD}/thread/${thread_num}`+`\n<b>Archive:</b> ${ARCHIVE_URL}${thread_num}`
      if(UPDATE_REPLY_COUNTER){
        text+=`\n<b>Replies:</b> 0`
      }
      if(first_post.ext!==undefined){ //if no picture
        const img_link=`https://i.4cdn.org/${BOARD}/${first_post.tim+first_post.ext}`
        if(first_post.ext===".gif"){
          queue_doc_via_link_and_msg_send(text,img_link)
        }else if(first_post.ext===".png"||first_post.ext===".jpg"){
          if(BLUR_NSFW){
            const thumbnail=`https://i.4cdn.org/${BOARD}/${first_post.tim}s.jpg`
            let image_for_check=img_link;
            if(first_post.w*first_post.h>4000000){ //2000*2000
              image_for_check=thumbnail
            } 
            const NSFW=await SFW.check(image_for_check)
            if(NSFW){
             const thumbnail=`https://i.4cdn.org/${BOARD}/${first_post.tim}s.jpg`
             const blurred_pic= await SFW.blur(thumbnail)
             queue_photo_via_buffer_and_msg_send(text,blurred_pic)
             return
            }
          }
          queue_photo_via_link_and_msg_send(text,img_link)
        }
      }else{
        queue_msg_send(text);  
      }
    }
  }catch(error) {
    console.log(error);
  }
}

var update_reply_counter_queue=[]
async function check_replies(){
   for (const thread of update_reply_counter_queue) {
    const posts= await axios.get(`https://a.4cdn.org/${BOARD}/thread/${thread.num}.json`,{headers: { 'If-Modified-Since':  0}})
    const first_post= posts.data.posts[0]
    const replies=first_post.replies
    
   }
}

startup()
setInterval(function(){
   get_threads(post_new_thread)
   if(UPDATE_REPLY_COUNTER){
    check_replies()
   }
 },60000);
 
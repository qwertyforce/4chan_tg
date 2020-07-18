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

const webm_to_mp4=require('./webm_to_mp4.js')
const POST_WEBMS=true

const UPDATE_REPLY_COUNTER=true
const MAX_TRACKED_THREADS=20;
const TRACKED_THREADS=[]

const VISITED=[];
var last_visit=0;

async function add_to_tracked_threads(msg,text,thread_num){
  if(TRACKED_THREADS.length>=MAX_TRACKED_THREADS){
    TRACKED_THREADS.shift()
  }
  TRACKED_THREADS.push({
    thread_num:thread_num,
    message_id: msg.message_id,
    text:text,
    replies:0
  })
}
function queue_msg_send(text,thread_num){
  queue.add(async () =>{
    const msg= await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){await add_to_tracked_threads(msg,text,thread_num)}
  }).catch((error) => {
    console.log(new Date().toUTCString())
    console.log(error);
  });  
}
//If image/document can't be send by link, we manually upload them to the telegram servers
function queue_doc_via_link_and_msg_send(text,doc_link,thread_num){
  queue.add(async () =>{
    await bot.telegram.sendDocument(CHANNEL_ID, doc_link)
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){ await add_to_tracked_threads(msg,text,thread_num)}
  }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
    const img_buffer= await axios.get(doc_link,{responseType: 'arraybuffer' })
    queue_doc_via_buffer_and_msg_send(text,img_buffer.data,thread_num)
  }); 
}

function queue_doc_via_buffer_and_msg_send(text,doc_buffer,thread_num){
  queue.add(async () =>{
    await bot.telegram.sendDocument(CHANNEL_ID,{source: doc_buffer,filename: '1.gif'})
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){ await add_to_tracked_threads(msg,text,thread_num)}
  }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
  }); 
}

function queue_video_via_buffer_and_msg_send(text,video_buffer,thread_num){
  queue.add(async () =>{
    await bot.telegram.sendVideo(CHANNEL_ID,{source: video_buffer,filename: '1.mp4'})
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){ await add_to_tracked_threads(msg,text,thread_num)}
  }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
  }); 
}

function queue_photo_via_link_and_msg_send(text,img_link,thread_num){
  queue.add(async () =>{
    await bot.telegram.sendPhoto(CHANNEL_ID, img_link)
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){ await add_to_tracked_threads(msg,text,thread_num)}
   }).catch(async (error) => {
    console.log(new Date().toUTCString())
    console.log(error);
    const img_buffer= await axios.get(img_link,{responseType: 'arraybuffer' })
    queue_photo_via_buffer_and_msg_send(text,img_buffer.data,thread_num,false)
  });  
}
function queue_photo_via_buffer_and_msg_send(text,img_buffer,thread_num,resized){
  queue.add(async () =>{
    await bot.telegram.sendPhoto(CHANNEL_ID,{source: img_buffer})
    const msg = await bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
    if(UPDATE_REPLY_COUNTER){ await add_to_tracked_threads(msg,text,thread_num)}
   }).catch(async (error) => {
    if(resized){console.log("error after resizing")}
    console.log(new Date().toUTCString())
    console.log(error);
    if(resized===false&&error.description==="Bad Request: PHOTO_INVALID_DIMENSIONS"){
      console.log("resizing big image")
      const resized_img_buffer= await SFW.resize(img_buffer)
      queue_photo_via_buffer_and_msg_send(text,resized_img_buffer,thread_num,true)
    }
   });
}

async function startup(){
  function make_visited(no){
    if(VISITED.length>=1000){
      VISITED.shift()
    }
    VISITED.push(no)
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
    if(!VISITED.includes(thread_num)){
      // console.log(thread_num)
      const posts = await axios.get(`https://a.4cdn.org/${BOARD}/thread/${thread_num}.json`,{headers: { 'If-Modified-Since':  0}}).catch((err)=>console.log('post_new_thread_err',err.config.url))
      const first_post= posts.data.posts[0]
      // console.log(first_post);
      VISITED.push(thread_num)
      // console.log("new thread")
      let text=first_post.com||''
      text=await format_text(text)
      text=`<b>${first_post.sub||''}</b>\n`+text+`\n<b>Thread:</b> https://boards.4channel.org/${BOARD}/thread/${thread_num}`+`\n<b>Archive:</b> ${ARCHIVE_URL}${thread_num}`
      if(UPDATE_REPLY_COUNTER){
        text+=`\n<b>Replies:</b> 0`
      }
      if(first_post.ext!==undefined){ //if attachment exists
        const img_link=`https://i.4cdn.org/${BOARD}/${first_post.tim+first_post.ext}`
        if(first_post.ext===".gif"){
          queue_doc_via_link_and_msg_send(text,img_link,thread_num)
        }else if(first_post.ext===".webm" && POST_WEBMS){
          const video_buffer=await webm_to_mp4.convert(img_link)      //in this case img_link contains video
          queue_video_via_buffer_and_msg_send(text,video_buffer,thread_num)
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
             queue_photo_via_buffer_and_msg_send(text,blurred_pic,thread_num,false)
             return
            }
          }
          queue_photo_via_link_and_msg_send(text,img_link,thread_num)
        }
      }else{
        queue_msg_send(text,thread_num);  
      }
    }
  }catch(error) {
    console.log(error);
  }
}


async function check_replies(){
   let message_ids_to_delete=[]
   for (const thread of TRACKED_THREADS) {
      const posts= await axios.get(`https://a.4cdn.org/${BOARD}/thread/${thread.thread_num}.json`,{headers: { 'If-Modified-Since':  0}}).catch((err)=>console.log('thread_check_err',err.config.url)) 
      if(posts){
        const first_post= posts.data.posts[0]
        const replies=first_post.replies
        if(replies===thread.replies){
          continue;
        }
        const index=thread.text.lastIndexOf("Replies:</b>")+12
        thread.text=thread.text.slice(0,index+1)+replies
        thread.replies=replies
        bot.telegram.editMessageText(CHANNEL_ID, thread.message_id,false,thread.text,{parse_mode:'HTML',disable_web_page_preview:true}).catch((err)=>console.log(err))
      }else{
        message_ids_to_delete.push(thread.message_id)
      }
   }
   for (const id of message_ids_to_delete) {
      const index = TRACKED_THREADS.findIndex((el)=>el.message_id===id)
      if(index!==-1){
        TRACKED_THREADS.splice(index,1)
      }
   }
}

startup().then(()=>{
  setInterval(function(){
    get_threads(post_new_thread)
    if(UPDATE_REPLY_COUNTER){
     check_replies()
    }
  },60000);
})

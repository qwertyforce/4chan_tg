const axios = require('axios');
const { Telegraf } = require('telegraf')

const {default: PQueue} = require('p-queue');
const queue = new PQueue({concurrency: 1});

const bot = new Telegraf("BOT_ID")
const CHANNEL_ID="@CHANNEL_NAME"
const BOARD='boardname' //for example pol

const SFW=require('./SFW.js')
const format_text=require('./format_text.js')(BOARD)


const BLUR_NSFW=true
var Visited=[];
var last_visit=0;

async function sendTextMessage(CHANNEL_ID,text){
  return bot.telegram.sendMessage(CHANNEL_ID,text,{parse_mode:'HTML',disable_web_page_preview:true})
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
      text=`<b>${first_post.sub||''}</b>\n`+text+`\n<b>Thread:</b> https://boards.4channel.org/${BOARD}/thread/${thread_num}`
      if(first_post.ext!==undefined){ //if no picture
        const img_link=`https://i.4cdn.org/${BOARD}/${first_post.tim+first_post.ext}`
        if(first_post.ext===".gif"){
          queue.add(async () =>{
            await bot.telegram.sendDocument(CHANNEL_ID, img_link)
            await sendTextMessage(CHANNEL_ID,text)
          }).catch((error) => {console.log(error);}); 
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
             queue.add(async () =>{
              await bot.telegram.sendPhoto(CHANNEL_ID,{source: blurred_pic,caption:"NSFW"})
              await sendTextMessage(CHANNEL_ID,text)
             }).catch((error) => {console.log(error);});
             return
            }
          }
            queue.add(async () =>{
              await bot.telegram.sendPhoto(CHANNEL_ID, img_link)
              await sendTextMessage(CHANNEL_ID,text)
             }).catch((error) => {console.log(error);});  
        }
      }else{
        queue.add(async () =>{
          await sendTextMessage(CHANNEL_ID,text)
        }).catch((error) => {console.log(error);});  
      }
    }
  }catch(error) {
    console.log(error);
  }
}

startup()
setInterval(function(){
   get_threads(post_new_thread)
 },60000);
 
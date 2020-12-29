const axios = require('axios');
const tf = require('@tensorflow/tfjs-node')
tf.enableProdMode()
const nsfw = require('nsfwjs')
const sharp = require('sharp');
const decode = require('image-decode')
let model;
(async () =>
 model = await nsfw.load('file://./model/',{type:'graph'}))()

 async function convert(image) {
  const {width, height,data} = decode(image)
  const numChannels = 3;
  const numPixels = width*height;
  const values = new Int32Array(numPixels * numChannels);

  for (let i = 0; i < numPixels; i++){
    for (let c = 0; c < numChannels; ++c){
      values[i * numChannels + c] = data[i * 4 + c];
    }
  }
  return tf.tensor3d(values, [height, width, numChannels], "int32");
}

async function check(image_url) {
  const pic= await axios.get(image_url,{responseType: 'arraybuffer' })
  const image = await convert(pic.data);
  const predictions = await model.classify(image);
  image.dispose()
  // console.log(predictions)
  if(predictions[0].className==="Hentai"||predictions[0].className==="Porn"||predictions[0].className==="Sexy"){
    return true
  }else{
    return false
  }
}

async function blur (image_url) {
  const pic= await axios.get(image_url,{responseType: 'arraybuffer' })
  return sharp(pic.data).blur(9).toBuffer();
}

async function resize(image_buffer) {
  let { width, height } = decode(image_buffer)
  let aspect_ratio = width / height
  if (aspect_ratio > 1) {
    width = 2500
    height = Math.floor(2500 / aspect_ratio)
  } else if (aspect_ratio < 1) {
    height = 2500
    width = Math.floor(2500 * aspect_ratio)
  } else {
    height = 2500
    width = 2500
  }
  return sharp(image_buffer).resize({ width: width, height: height }).toBuffer()
}


module.exports = {check,blur,resize};

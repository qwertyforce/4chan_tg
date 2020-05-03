const axios = require('axios');
const tf = require('@tensorflow/tfjs-node')
tf.enableProdMode()
const nsfw = require('nsfwjs')
const sharp = require('sharp');
const decode = require('image-decode')
var model;
(async () =>
 model = await nsfw.load('file://./model/'))()

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
  console.log(predictions)
  if(predictions[0].className==="Hentai"||predictions[0].className==="Porn"||predictions[0].className==="Sexy"){
    return true
  }else{
    return false
  }
}

async function blur (image_url) {
  const pic= await axios.get(image_url,{responseType: 'arraybuffer' })
  return sharp(pic.data).blur(5).toBuffer();
}

module.exports = {check,blur};

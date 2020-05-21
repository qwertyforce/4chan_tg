const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const stream = require('stream');
ffmpeg.setFfmpegPath(ffmpegPath);
const fs=require('fs')

function makeid(length) {
  let result           = '';
  const characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for ( let i = 0; i < length; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

async function convert(video_link) {
  const bufferStream = new stream.PassThrough();
  return new Promise((resolve, reject) => {
    axios.get(video_link, { responseType: 'arraybuffer' }).then((data) => {
      let random_name = makeid(10)
      let output = `./${random_name}.mp4`
      bufferStream.end(data.data)
      ffmpeg(bufferStream)
        .size('960x540').audioCodec('aac').videoCodec('libx264').on('end', () => {
          fs.readFile(output, (err, data) => {
            if (err) throw err;
            fs.unlink(output, (err) => {
              if (err) {
                console.error(err)
                return
              }
              resolve(data)
            })
          })
        }).save(output)
    });
  })


}
module.exports = {convert};

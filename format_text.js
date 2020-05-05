const br=new RegExp("<br>", 'g')
const remove_junk=new RegExp(`<wbr>|<span class="quote">|<span class="deadlink">|</span>`, 'g')
var lnk;
var BOARD;
const lnk2=new RegExp(`href="//`, 'g')

async function format_text(text) {
    text=text.replace(lnk, `"https://boards.4channel.org/${BOARD}/thread/`)
    text=text.replace(lnk2, `href="https://`)
    text=text.replace(br, '\n')
    text=text.replace(remove_junk, '')
    return text
}
function init(Board){
  BOARD=Board;
  lnk=new RegExp(`"/${BOARD}/thread/`, 'g')
  return format_text
}


module.exports = init;

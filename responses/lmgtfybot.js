module.exports = {
  command: function(bot, msg) {
      var phrase = '!lmgtfybot';
      if (msg.author.bot === false) {
          var wordsArr = msg.content.split(' ');
          wordsArr.map(function(word, index) {
              if (word.toLowerCase() === phrase) {
                  var message = 'http://lmgtfy.com/?s=d&q=' + encodeURI(wordsArr.join(' ').replace(word, '').trim());
                  msg.channel.send(message);
              }
          });
      }
  },
  help: '`!lmgtfy string` let me google that for you.'
};
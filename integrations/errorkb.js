//Dependencies
var Discord = require('discord.js'); //Used for notifications
const rp = require('request-promise'); //Used for HTTP-methods
const $ = require('cheerio'); //Used for HTML-parsing
var schedule = require('node-schedule');

//Global variables
const baseUrl = 'https://hi.service-now.com'; //Base-url for HI
const kbUrl = "/kb_view.do?sysparm_article=KB0597477" //URL for known-errors family/versions article
var bot = new Discord.Client();
var MongoClient = require('mongodb').MongoClient;
var scheduleJob;
var mongoUrl = process.env.MONGODB_URI

//Settings
var mongoDb = "cajonbot"; //Mongodb database-id
var mongoCollection = "KBArticles"; //Mongodb collection-id
var articleCheckEnabled = true; //If true then the scheduled job will check SN/HI for new known error articles
var articleNotificationEnabled = true; //If true then notifications will be posted to discord when a new article is found
var schedulePlan = "*/1 * * * *"; //Time-settings for scheduled-job, see https://openbase.io/js/node-schedule for details
var channelId = "563567455675351041"; //Channel-id which controls where the notification-messages are posted


//Pulls all relevant ServiceNow families / versions along with URL's for their respective known-error KB-articles 
//and passes the versions to pullArticles()
var pullVersions = function () {
  console.log("Starting check for ServiceNow versions");
  var versions = [];
  rp(baseUrl + kbUrl)
    .then(function (html) {
      var kbHtml = $('li > a', html);
      for (var i = 0; i < kbHtml.length; i++) {
        if (kbHtml[i].attribs.title && kbHtml[i].attribs.href) {
          var version = {
            title: kbHtml[i].attribs.title,
            href: kbHtml[i].attribs.href
          }
          console.log("Loading articles for version: " + version.title);
          pullArticles(version.href);
        }
      }
    })
    .catch(function (err) {
      console.log("Error in known-error integration: " + err);
    });
}

//Pulls all kb-articles from a version/family page and passes each article to parseArticle()
var pullArticles = function (url) {
  var articles = [];
  rp(baseUrl + url)
    .then(function (html) {
      var errors = $('table.scroll', html);
      var sevOne = errors[0];
      var sevTwo = errors[1];
      var sevOneArticles = $("tr", sevOne);
      for (var i = 1; i < sevOneArticles.length; i++) {
        articles.push(pullArticle(sevOneArticles[i], 1));
      }
      var sevTwoArticles = $("tr", sevTwo);
      for (var i = 1; i < sevTwoArticles.length; i++) {
        articles.push(pullArticle(sevTwoArticles[i], 2));
      }
      parseArticles(articles);
    })
    .catch(function (err) {
      console.log("Error in known-error integration: " + err);
    });
}


//Parses each article and checks if they already exists in mongodb. If not they're added and
//a notification is sent to discord (provided articleNotificationEnabled is true)
var parseArticles = function (articles) {
  console.log('Starting to parseArticles');
  MongoClient(mongoUrl, {
    useNewUrlParser: true
  }, function (err, client) {
    var db = client.db(mongoDb);
    var count = 0;
    if(err){
      console.error(err);
    }
    //Search for existing articles with the same article-number
    db.collection(mongoCollection).findOne({ "article": article.article }, function (err, result) {
      console.log("result", result);
      if (err) {
        console.error("Error in known-error integration: " + err);
      }
      //If no results found then this is a new article and a notification should be broadcasted
      //else if (result === null) {
      if (true) {
        articles.forEach(function (article) {
          console.log('inserting article', article.article);
          db.collection(mongoCollection).insertOne(article, function (err, res) {
            if (err) {
              console.error("Error in known-error integration: " + err);
            }
            else {
              console.log("New article found, inserted article " + article.article + "!");
              if (articleNotificationEnabled) {
                postArticle(article);
              }
            }
          });

          //Check if all articles have been processed and close mongodb-connection if so
          count++;
          if (count == articles.length) {
            client.close();
          }
        });
      }
    });
  });
}

//Pulls specific fields from an article's HTML
var pullArticle = function (html, severity) {
  var article = {}
  var articleHtml = $("td", html);
  article.article = $("a", articleHtml[0]).text();
  article.url = $(articleHtml[0]).children()[0].attribs.href;
  article.problem = $(articleHtml[1]).text();
  article.category = $(articleHtml[2]).text();
  article.short_description = $(articleHtml[3]).text();
  article.severity = severity;
  return article;
}


//Posts notification to discord
var postArticle = function (article) {
  if (article != undefined) {
    var message = "A new severity " + article.severity + " known error has been created. \n" +
      "Article: " + article.article + " Problem: " + article.problem + " Category: " + article.category + " \n" +
      "Description: " + article.short_description + " \n" +
      baseUrl + article.url;
    bot.channels.get(channelId).send(message);
  }
}


module.exports = {
  start: function (inBot, inCheckEnabled, inNotificationEnabled, inSchedule, inChannel) {
    bot = inBot;
    articleCheckEnabled = inCheckEnabled === undefined ? articleCheckEnabled : inCheckEnabled;
    articleNotificationEnabled = inNotificationEnabled === undefined ? articleNotificationEnabled : inNotificationEnabled;
    schedulePlan = inSchedule === undefined ? schedulePlan : inSchedule;
    channelId = inChannel === undefined ? channelId : inChannel;
    if (articleCheckEnabled) {
      console.log("Activating check for articles");
      scheduleJob = schedule.scheduleJob(schedulePlan, pullVersions);
    }
  },
  stop: function () {
    console.log("Stopping check for articles");
    scheduleJob.cancel();
  }
}

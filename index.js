var irc = require("irc");
var fs = require("fs");
var config = require("./config.js");
var jsonfile = require("jsonfile");
var format = require("util").format;
var inspect = require("util").inspect;
var google = require('google');
var fetch = require("node-fetch");
fetch.Promise = require("bluebird");
google.resultsPerPage = 1;
require('string.prototype.startswith');

var users;

var actions = {
    JOIN: "join",
    PART: "part",
    MSG: "msg",
    ERROR: "error",
    INFO: "info"
};


var bot = new irc.Client(config.server, config.botName, {
    channels: config.channels
});

bot.addListener("names" + config.channels[0], function(nicks) {
    //Object.keys because node-irc returns nicks as a large object with empty keys...
    users = Object.keys(nicks);


});

bot.addListener("join", function(channel, who) {
    log(actions.JOIN, who + " joined " + channel);
    if(who.indexOf("lounge-user") > -1) {
    	bot.say(who, "Hey, " + who + ", now that you've figured out how to use The Lounge, feel free to change your nickname to something more personal using the /nick <new_nickname> command so we know who you are :)");
    }
});

bot.addListener("message", function(from, to, text) {
    var splitMessage = text.split(" ");
    var message = "";
    log(actions.MSG, "(" + to + ") " + from + ": " + text);

    //It's a command!
    if (splitMessage[0].startsWith(config.commandPrefix)) {
        if (splitMessage[0] === "!gh" || splitMessage[0] === "!github") {
            //just !gh
            if (splitMessage.length === 1) {
                message = format("https://github.com/%s/%s", config.githubUser, config.githubRepo);
                //<number> or repo info
            } else if (splitMessage.length === 2) {
                var arg = splitMessage[1];
                //It's a number, so it's an issue
                if (stringIsPositiveInteger(arg)) {
                    log(actions.INFO, config.githubUser);
                    message = getIssueInformation({
                        user: config.githubUser,
                        repo: config.githubRepo,
                        issue: arg
                    });
                } else {
                    var userRepo = parseUserRepoString(arg);
                    mesage = format("https://www.github.com/%s/%s", userRepo.user, userRepo.repo);
                }
            } else if (splitMessage.length === 3) {
                if (stringIsPositiveInteger(splitMessage[2])) {
                    message = getIssueInformation(withIssue(parseUserRepoString(splitMessage[1]), splitMessage[3]));
                } else {
                    message = format("https://github.com/%s/%s", splitMessage[1], splitMessage[2]);
                }
            } else if (splitMessage.length === 4) {
                message = getIssueInformation({
                    user: splitMessage[1],
                    repo: splitMessage[2],
                    issue: splitMessage[3]
                });
            }

            //Google command
        } else if ((splitMessage[0] === "!g" || splitMessage[0] === "!google") && splitMessage.length > 1) {
            //Remove the command from the message array
            var query = splitMessage.slice(1).join(' ');
            log(actions.INFO, query);
            google(query, function(err, next, links) {
            	if(err) {
            		log(actions.ERROR, err);
            	}
            	bot.say(to, links[0].title + ' - ' + links[0].link);        	
            });
        }

        log(actions.INFO, message);
        if(message !== "") {
	        if (message.then) {
	            message.then(function(m) {
	                return bot.say(to, m);
	            });
	        } else {
	            bot.say(to, message);
	        }
		}
    }
});

/** Utils **/

var log = function(action, message) {
	var message = "[" + action.toUpperCase() + "]" + " " + message;
	console.log(message);
	fs.open('log.txt', 'a', 666, function(e, id) {
		fs.write(id, message + "\n", null, 'utf8', function(){
			fs.close(id);
		});
	});
}

var userInChannel = function(user) {
    if (users.indexOf(user.toString().toLowerCase()) > -1) {
        return true;
    } else {
        return false;
    }
}

var arrayObjectIndexOf = function(array, searchTerm, property) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (array[i][property] === searchTerm) {
            return i;
        }
    }
    return -1;
}

/** Github **/
//Credits to tennu-github for parts of the following.
var getIssueInformation = function(options) {
    var user = options.user;
    var repo = options.repo;
    var issueNumber = options.issue;
    var result = format("https://api.github.com/repos/%s/%s/issues/%s", user, repo, issueNumber);
    return fetch(result).then(function(res) {
        log(actions.INFO, result);
        return res.json();
    }).then(function(res) {
        if (res.message === "Not Found") {
            return "Issue does not exist.";
        }

        var type = res.pull_request === undefined ? "Issue" : "PR";
        var status = res.state;
        var title = res.title;
        var link = res.html_url;

        if (type === "PR" && status === "closed") {
            return fetch(res.pull_request.url).then(function(res) {
                return res.json();
            }).then(function(res) {
                if (res.message === "Not Found") {
                    return "PR does not exist.";
                }

                var type = "PR";
                var status = res.merged_at === null ? "closed" : "merged";
                var title = res.title;
                var link = res.html_url;

                return format("[%s %s] (%s) %s (%s)", type, issueNumber, status, title, link);
            });
        } else {
            return format("[%s %s] (%s) %s (%s)", type, issueNumber, status, title, link);
        }
    });
}

var withIssue = function(obj, issueNumber) {
    obj.issue = issueNumber;
    return obj;
}

var stringIsPositiveInteger = function(string) {
    var number = Number(string);

    if (isNaN(number)) {
        return false;
    }

    if (number === Infinity) {
        return false;
    }

    if (number < 1) {
        return false;
    }

    if (Math.floor(number) !== number) {
        return false;
    }

    return true;
}


var parseUserRepoString = function(userRepoString) {
    if (userRepoString.length === 0) {
        return {
            user: config.githubUser,
            repo: config.githubRepo
        };
    }

    if (userRepoString.indexOf("/") === -1) {
        return {
            user: config.githubUser,
            repo: config.userRepoString
        };
    }

    var split = userRepoString.split("/");
    var user = split[0].length !== 0 ? split[0] : config.githubUser;
    var repo = split[1].length !== 0 ? split[1] : config.githubRepo;

    return {
        user: user,
        repo: repo
    };
}
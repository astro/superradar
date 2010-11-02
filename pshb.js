var http = require('http');
var url = require('url');
var querystring = require('querystring');

module.exports = {
    subscribe: function(hub, topic, callback, token, secret, cb) {
	var form = {
	    hub: { callback: callback,
		   mode: 'subscribe',
		   topic: topic,
		   verify: 'sync',
		   secret: secret,
		   verify_token: token
	    }
	};
console.log({form:form});

	var hu = url.parse(hub.url);
	var cl = http.createClient(hu.port || 80, hu.hostname);
	var body = querystring.stringify(form);
	var headers = { 'Host': hu.hostname,
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': body.length
		      };
	if (hub.user && hub.password)
	    headers['Authorization'] = 'Basic ' +
	    (new Buffer(hub.user + ':' + hub.password)).toString('base64');
	var req = cl.request('POST', hu.pathname, headers);
console.log({body:body});
	req.write(body);
	req.end();

	req.on('response', function(res) {
console.log({'PSHB subscribe res': res});
	    if (res.statusCode === 200) {
		cb(null);
	    } else {
		cb(new Error('HTTP ' + res.statusCode));
		res.on('data', function(data) {
		    console.log('e: ' + data);
		});
	    }
	});
    },


    /**
     * checkSubscription: function(subscribed, url, token, cb)
     *
     **/
    makeCallbackHandler: function(hubPath, checkSubscription) {
	// caller must check path
	return function(req, res, next) {
console.log({m:req.method,u:req.url});
	    var path_search = req.url.split(/\?/, 2);
	    var path = path_search[0];
	    var search = path_search[1];

	    if (path !== hubPath)
		return next();

	    if (req.method === 'GET') {
console.log({pshbUrl: req.url});
		/* Subscribe Verification */
		var query = querystring.parse(search);
		var subscribed = query.hub.mode === 'subscribe';
		var topic = query.hub.topic;
		var challenge = query.hub.challenge;
		var token = query.hub.verify_token;

		checkSubscription(subscribed, topic, token,
				  function(match) {
				      if ((subscribed && match) ||
					  (!subscribed && !match)) {
					  res.writeHead(200, { });
					  res.end(challenge);
				      } else {
					  res.writeHead(404, { });
					  res.end();
				      }
				  });

	    /*} else if (req.method === 'POST') {
		/* Subscription */
	    } else {
		res.writeHead(400, { });
		res.end();
	    }
	};
    }
};

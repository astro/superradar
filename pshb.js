var http = require('http');
var url = require('url');
var querystring = require('querystring');
var atom = require('./atom');

module.exports = {
    subscribe: function(hub, topic, callback, token, secret, cb) {
	var form = { 'hub.callback': callback,
		     'hub.mode': 'subscribe',
		     'hub.topic': topic,
		     'hub.verify': 'sync',
		     'hub.secret': secret,
		     'hub.verify_token': token
		   };
console.log({hub:hub,form:form});

	var hu = url.parse(hub);
	var cl = http.createClient(hu.port || 80, hu.hostname);
	var body = querystring.stringify(form);
	var headers = { 'Host': hu.hostname,
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': body.length
		      };
	if (hu.auth)
	    headers['Authorization'] = 'Basic ' +
	    (new Buffer(hu.auth)).toString('base64');

	var req = cl.request('POST', hu.pathname, headers);
console.log({body:body});
	req.write(body);
	req.end();

	req.on('response', function(res) {
console.log({'PSHB subscribe res': res});
	    if (res.statusCode >= 200 && res.statusCode < 300) {
		cb(null);
	    } else {
		var text = '';
		res.setEncoding('utf-8');
		res.on('data', function(data) {
		    text += data;
		});
		res.on('end', function() {
		    var msg = 'HTTP ' + res.statusCode;
		    if (text)
			msg += ': ' + text;
		    cb(new Error(msg));
		});
	    }
	});
    },


    /**
     * checkSubscription: function(subscribed, url, token, cb)
     *
     **/
    makeCallbackHandler: function(hubPath, checkSubscription, onFeed) {
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

	    } else if (req.method === 'POST') {
		/* Subscription */
console.log({'postHdrs':req.headers});
		req.setEncoding('utf-8');
		var p = atom.parse(function(err, tree) {
		    if (!err) {
			res.writeHead(200, { });
			res.end();

			if (tree) {
			    onFeed(atom.extractFeed(tree));
			}
		    } else {
			console.error(err.stack);
			res.writeHead(500, { });
			res.end(err.message);
		    }
		});
		// TODO: verify req.headers['x-hub-signature']
		req.on('data', p.write);
		req.on('end', p.end);

	    } else {
		res.writeHead(400, { });
		res.end();
	    }
	};
    }
};

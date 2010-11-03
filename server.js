process.addListener('uncaughtException', function(e) {
			console.error(e.stack);
		    });

var sys = require('sys'),
    config = require('./config'),
    model = require('./model'),
    pshb = require('./pshb'),
    atom = require('./atom');

var hubUrl = 'http://' + config.pshb.host + config.pshb.path;


/* A counter, for getEntriesSince() to determine whether to wait or
 * just retry the SQLite query.
 */
var entriesReceived = 0;

var onUpdateQueue = [];

function onEntries(entries) {
  sys.puts("onEntries() "+entries.length+" entries, "+onUpdateQueue.length+" queued");
  var updateQueueTrigger = function() {
    /* Trigger waiting requests */
    if (entries.length > 0) {
      onUpdateQueue.forEach(function(f) { f(); });
      onUpdateQueue = [];
    }
  };

  entriesReceived += entries.length;
  entries.forEach(function(entry) {
		    sys.puts(entry.rss+" "+entry.id+" "+entry.published);

		    if (isNaN(Date.parse(entry.published))) {
		      /* Fix published date so we have a date at all */
		      entry.published = new Date().toISO8601();
		      sys.puts("created: "+entry.published);
		    }

		    bulkQuery("INSERT INTO items (rss, id, date, content) VALUES (?, ?, ?, ?)",
			      [entry.rss, entry.id, entry.published, JSON.stringify(entry)],
			      updateQueueTrigger);
		  });
  /* For superfeedr there's always 1 notification per rss url */
  if (entries[0])
    bulkQuery("DELETE FROM items WHERE rss LIKE ? AND serial < " +
	      "(SELECT serial FROM items WHERE rss LIKE ? ORDER BY serial DESC LIMIT 1 OFFSET 9)",
	      [entries[0].rss, entries[0].rss],
	      updateQueueTrigger);
}



function pshbCheckSubscription(subscribed, url, token, cb) {
    model.getSubscription(url, function(feed) {
console.log({getSubscription:feed,token:token});
	cb(feed && feed.token === token);
    });
};

function pshbOnFeed(feed) {
    model.addEntries(feed.entries, function() {
    });
}

/* Web stuff */

function adminCheck(req) {
  var admin = config.adminCheck(req.socket.remoteAddress);
  if (admin) {
    var xff = req.headers['x-forwarded-for'];
    if (xff)
      admin = config.adminCheck(xff);
  }
  return admin ? true : false;
}

function app(app) {
    app.get('/updates/:since', function(req, res) {
	var since = parseInt(req.params.since, 10);
	model.getEntriesSince(since, function(entries) {
	    sys.puts("yielding "+entries.length+" entries since "+since);
	    res.writeHead(200, {});
	    res.end(JSON.stringify(entries));
	});

    });
    app.get('/admincheck', function(req, res) {
	res.writeHead(200, {});
	res.end(JSON.stringify(adminCheck(req)));
    });
    app.post('/subscribe', function(req, res) {
	if (adminCheck(req)) {
	    req.setEncoding('utf-8');
	    var url = '';
	    req.on('data', function(data) {
		url += data;
	    });
	    req.on('end', function() {
		console.log({url:url});
		model.addSubscription(url, 'foobar', 'quux', function(err) {
		    if (!err)
			pshb.subscribe(config.superHub, url, hubUrl,
				       'foobar', 'quux', function(err) {
			    res.writeHead(err ? 500 : 200, {});
			    res.end(err && err.message);
			});
		    else if (err.message === 'constraint failed') {
			res.writeHead(200, {});
			res.end();
		    } else {
			console.error(err.stack);
			res.writeHead(400, {});
			res.end(err.message);
		    }
		});
	    });
	} else {
	    res.writeHead(403, {});
	    res.end();
	}
    });
}

var Connect = require('connect');
Connect.createServer(
    Connect.logger(),
    pshb.makeCallbackHandler(config.pshb.path,
			     pshbCheckSubscription, pshbOnFeed),
    Connect.router(app),
    Connect.staticProvider(__dirname + '/public'),
    Connect.errorHandler({ dumpExceptions: true, showStack: true })
).listen(4000);



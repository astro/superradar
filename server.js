var sys = require('sys'),
  config = require('./config');

process.addListener('uncaughtException', function(e) {
			sys.puts(e.stack);
		    });


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

function getEntriesSince(since, cb) {
  var old_entriesReceived = entriesReceived;

  var since_ = Number(since);
  var entries = [];
  db.query("SELECT serial, content FROM items WHERE serial > ? ORDER BY serial DESC LIMIT 30",
	   [since_], function(error, row) {
	     if (row) {
	       /* Row */
	       try {
		 var entry = JSON.parse(row.content);
		 /* Save bandwidth for this request: */
		 delete entry.content;
		 delete entry.summary;
	       } catch (e) {
		 sys.puts("Error parsing content: "+e);
		 sys.puts(row.content);
		 return;
	       }
	       entry.serial = row.serial;
	       entries.push(entry);
	     } else if (!error) {
	       /* Select finished */
	       if (entries.length > 0) {
		 /* Done, trigger callback */
		 cb(entries);
	       } else {
		 /* No entries */
		 if (old_entriesReceived == entriesReceived) {
		   onUpdateQueue.push(function() {
		     getEntriesSince(since, cb);
		   });
		 } else {
		   /* There were updates during the SELECT, retry immediately */
		   getEntriesSince(since, cb);
		 }
	       }
	     } else
	       throw error;
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
    app.head('/', function(req, res) {
	res.writeHead(200, {});
	res.end();
    });
    app.get('/updates/:since', function(req, res) {
	var since = req.params.since;
	getEntriesSince(since, function(entries) {
	    sys.puts("yielding "+entries.length+" entries since "+since);
	    res.writeHead(200, {});
	    res.end(JSON.stringify(entries));
	});

    });
    app.get('/admincheck', function(req, res) {
	res.writeHead(200, {});
	res.end(JSON.stringify(adminCheck(req)));
    });
    // FIXME: XSS prone, wait for body-decoder to get usable, then switch to POST
    app.get('/subscribe', function(req, res) {
	if (adminCheck(req)) {
	    var url = req.params['url'];
	    subscribe(url, function(success) {
		res.writeHead(success ? 200 : 500, {});
		res.end();
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
    Connect.router(app),
    Connect.staticProvider(__dirname + '/public'),
    Connect.errorHandler({ dumpExceptions: true, showStack: true })
).listen(4000);



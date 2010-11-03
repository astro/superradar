var sqlite = require('sqlite');

var db = new sqlite.Database();
db.query("PRAGMA synchronous=OFF", function() { });

/* Query management */
var pending = 0;
var queue = [];

function enqueue(f) {
    if (pending < 1) {
	pending++;
	// Call immediately
	f();
    } else {
	queue.push(f);
    }
}

function done() {
    pending--;
    process.nextTick(function() {
	if (pending < 1 && queue.length > 0) {
	    var f = queue.shift();
	    pending++;
	    f();
	}
    });
}

function query(sql, values, cb) {
    enqueue(function() {
	db.query(sql, values, function() {
	    done();
	    cb.apply(db, arguments);
	});
    });
}

/* Initialization */
enqueue(function() {
    db.open("radar.db", function(err) {
	if (err) {
	    console.error(err);
	    process.exit(1);
	}
	done();
    });
});
query("CREATE TABLE items (" +
      "serial INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "rss TEXT, id TEXT, date INT, content TEXT, " +
      "UNIQUE (rss, id))", [], function() {
	  console.log("CREATE items -> " + JSON.stringify(arguments));
});
query("CREATE TABLE feeds (" +
      "rss TEXT PRIMARY KEY, " +
      "token TEXT, " +
      "secret TEXT)", [], function() {
	  console.log("CREATE feeds -> " + JSON.stringify(arguments));
});

/* API */

var onUpdateQueue = [];

module.exports.addEntries = function(entries, cb) {
    var pending = 0;
    entries.forEach(function(entry) {
console.log({entry:entry.id});
	query("INSERT INTO items (rss, id, date, content) VALUES (?, ?, ?, ?)",
	      [entry.rss, entry.id, entry.published, JSON.stringify(entry)],
	      function() {
		  pending--;
console.log({pending:pending});
		  if (pending > 0)
		      return;

		  cb.apply(db, arguments);

		  var updateQueue = onUpdateQueue;
		  onUpdateQueue = [];
		  process.nextTick(function() {
		      console.log({updateQueue:updateQueue.length});
		      updateQueue.forEach(function(f) { f(); });
		  });
	      });
        pending++;
    });
};

module.exports.getEntriesSince = function getEntriesSince(since, cb) {
console.log({getEntriesSince:since});
    var entries = [];
    query("SELECT serial, content FROM items WHERE serial >= ? ORDER BY serial DESC LIMIT 30",
	  [since + 1], function(error, row) {
	      if (row) {
		  /* Row */
		  var entry;
		  try {
		      entry = JSON.parse(row.content);
console.log({eP:entry.published});
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
console.log({'getEntriesSince query':entries.length});
		  if (entries.length > 0) {
		      /* Done, trigger callback */
		      cb(entries);
		  } else {
		      /* No entries */
		      onUpdateQueue.push(function() {
			  getEntriesSince(since, cb);
		      });
		  }
	      } else
		  throw error;
	  });
};

module.exports.getSubscription = function(rss, cb) {
    var emitted = false;
    query("SELECT rss, token, secret FROM feeds WHERE rss = ?", [rss],
	  function(err, row) {
	      if (err)
		  cb(err);
	      else if (!emitted) {
		  cb(row);
	      }
    });
};

module.exports.addSubscription = function(rss, token, secret, cb) {
    query("INSERT INTO feeds (rss, token, secret) VALUES (?, ?, ?)",
	  [rss, token, secret],
	  function(err) {
	      // TODO: already exists? ...in caller
	      cb(err);
	  });
};


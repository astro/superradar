var sqlite = require('sqlite/sqlite');

var db = new sqlite.Database();
db.query("PRAGMA synchronous=OFF", function() { });

exports.init = function(model) {
    /* Query management */
    var pending = 0;
    var queue = [];

    var enqueue = function(f) {
	if (pending < 1) {
	    pending++;
	    // Call immediately
	    f();
	} else {
	    queue.push(f);
	}
    };
    var done = function() {
	pending--;
	process.nextTick(function() {
	    if (pending < 1 && queue.length > 0) {
		pending++;
		f();
	    }
	});
    };
    var query = function(sql, values, cb) {
	enqueue(function() {
	    db.query(sql, values, function() {
		done();
		cb.apply(db, arguments);
	    });
	});
    };

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
	  "token TEXT)", [], function() {
	      console.log("CREATE feeds -> " + JSON.stringify(arguments));
	  });

    /* API */
    return {
	addEntries: function(entries, cb) {
	    entries.forEach(function(entry) {
		query("INSERT INTO items (rss, id, date, content) VALUES (?, ?, ?, ?)",
		      [entry.rss, entry.id, entry.published, JSON.stringify(entry)],
		      cb);
	    });
	}
    };
};

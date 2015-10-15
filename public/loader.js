var loader, define, requireModule, require, requirejs;
var global = this;

(function() {
  function Completion(normal, thrown) {
    this.normal = normal;
    this.thrown = thrown;
  }

  Completion.normal = function(value) {
    return new Completion(value, undefined);
  };

  Completion.thrown = function(reason) {
    var caught;
    try { throw new Error(reason) } catch(e) { caught = e }
    return new Completion(undefined, caught);
  }

  Completion.prototype = {
    or: function(callback) {
      if (this.thrown) return coerce(callback, this.thrown);
      else return this;
    },

    finally: function(callback) {
      return coerce(callback).and(Completion.normal);
    },

    and: function(callback) {
      if (this.normal) return coerce(callback, this.normal);
      else return this;
    },

    done: function() {
      if (this.thrown) throw this.thrown;
      else return this.normal;
    }
  };

  function coerce(callback, value) {
    if (callback instanceof Completion) return callback;
    else return run(callback, value);
  }

  function run(callback, val) {
    var normal, thrown;

    try { var value = callback(val); normal = value; }
    catch(e) { thrown = e; }

    return new Completion(normal, thrown);
  }

  // Save off the original values of these globals, so we can restore them if someone asks us to
  var oldGlobals = {
    loader: loader,
    define: define,
    requireModule: requireModule,
    require: require,
    requirejs: requirejs
  };

  loader = {
    noConflict: function(aliases) {
      var oldName, newName;

      for (oldName in aliases) {
        if (aliases.hasOwnProperty(oldName)) {
          if (oldGlobals.hasOwnProperty(oldName)) {
            newName = aliases[oldName];

            global[newName] = global[oldName];
            global[oldName] = oldGlobals[oldName];
          }
        }
      }
    }
  };

  var _isArray;
  if (!Array.isArray) {
    _isArray = function (x) {
      return Object.prototype.toString.call(x) === "[object Array]";
    };
  } else {
    _isArray = Array.isArray;
  }

  var registry = {};
  var seen = {};
  var FAILED = false;

  var uuid = 0;

  function unsupportedModule(length) {
    throw new Error("an unsupported module was defined, expected `define(name, deps, module)` instead got: `" + length + "` arguments to define`");
  }

  var defaultDeps = ['require', 'exports', 'module'];

  function Module(name, deps, callback, exports) {
    this.id       = uuid++;
    this.name     = name;
    this.deps     = !deps.length && callback.length ? defaultDeps : deps;
    this.exports  = exports || { };
    this.callback = callback;
    this.state    = undefined;
    this._require  = undefined;
  }


  Module.prototype.makeRequire = function() {
    var name = this.name;

    return this._require || (this._require = function(dep) {
      if (name.indexOf('/') === -1) var fallback = name + '/index';
      return internalRequire(resolve(dep, name).done(), name)
        .or(resolve(fallback, name).done(), name).done();
    });
  }

  define = function(name, deps, callback) {
    if (arguments.length < 2) {
      unsupportedModule(arguments.length);
    }

    if (!_isArray(deps)) {
      callback = deps;
      deps     =  [];
    }

    registry[name] = new Module(name, deps, callback, null);
  };

  // we don't support all of AMD
  // define.amd = {};

  function Alias(path) {
    this.name = path;
  }

  define.alias = function(path) {
    return new Alias(path);
  };

  function reify(mod, name, seen) {
    var deps = mod.deps;
    var length = deps.length;
    var reified = new Array(length);
    var dep;
    // TODO: new Module
    // TODO: seen refactor
    var module = { };

    for (var i = 0, l = length; i < l; i++) {
      dep = deps[i];
      if (dep === 'exports') {
        module.exports = reified[i] = seen;
      } else if (dep === 'require') {
        reified[i] = mod.makeRequire();
      } else if (dep === 'module') {
        mod.exports = seen;
        module = reified[i] = mod;
      } else {
        var fallback = dep + '/index';
        requireFrom(resolve(dep, name).done(), name)
          .or(requireFrom(resolve(fallback, name).done(), name))
          .done();
      }
    }

    return {
      deps: reified,
      module: module
    };
  }

  function requireFrom(name, origin) {
    var mod = registry[name], fallback;
    if (!mod) {
      return Completion.thrown('Could not find module `' + name + '` imported from `' + origin + '`');
    }

    if (name.indexOf('/') === -1) fallback = name + '/index';
    return internalRequire(name).or(internalRequire(fallback));
  }

  function missingModule(name) {
    return Completion.thrown('Could not find module ' + name);
  }

  function internalRequire(name) {
    var mod = registry[name];

    if (mod && mod.callback instanceof Alias) {
      mod = registry[mod.callback.name];
    }

    if (!mod) { return missingModule(name); }

    if (mod.state !== FAILED &&
        seen.hasOwnProperty(name)) {
      return Completion.normal(seen[name]);
    }

    var reified;
    var module;
    var loaded = false;

    seen[name] = { }; // placeholder for run-time cycles

    return run(function() {
      reified = reify(mod, name, seen[name]);
      module = mod.callback.apply(this, reified.deps);
      loaded = true;
    }).or(function(e) {
      mod.state = FAILED;
      throw e;
    }).and(function() {
      var obj;
      if (module === undefined && reified.module.exports) {
        obj = reified.module.exports;
      } else {
        obj = seen[name] = module;
      }

      return (seen[name] = obj);
    });
  };

  requirejs = require = requireModule = function(name) {
    return internalRequire(name).done();
  }

  function resolve(child, name) {
    if (child.charAt(0) !== '.') { return Completion.normal(child); }

    var fromTopLevel = name.indexOf('/') === -1;

    var parts = child.split('/');
    var nameParts = name.split('/');
    var parentBase = nameParts.slice(0, -1);

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];

      if (part === '..') {
        if (parentBase.length === 0) {
          return Completion.thrown('Could not look up `' + child + '` imported from `' + name + '` (too many ..\'s)');
        }
        parentBase.pop();
      } else if (part === '.' && fromTopLevel) {
        parentBase.push(name);
      } else if (part === '.') {
        continue;
      } else { parentBase.push(part); }
    }

    return Completion.normal(parentBase.join('/'));
  }

  requirejs.entries = requirejs._eak_seen = registry;
  requirejs.unsee = function(moduleName) {
    delete seen[moduleName];
  };

  requirejs.clear = function() {
    requirejs.entries = requirejs._eak_seen = registry = {};
    seen = {};
  };
})();
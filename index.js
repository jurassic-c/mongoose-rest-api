var Q = require('q');

function RestCrud(Model, object_id_parameter) {
  if(!Model) throw "no Model specified";

  var get = function(req, res) {
    if(!req) throw "no Request object specified";
    if(!res) throw "no Response object specified";
    
    var deferred = Q.defer();

    var columns = null;
    if(req.query.columns) columns = req.query.columns.join(" ");

    var populate = '';
    if(req.query.populate) populate = req.query.populate.join(" ");

    if(object_id_parameter && req.params[object_id_parameter]) {
      Model.findById(req.params[object_id_parameter], columns).populate(populate).exec(function(err, object) {
        if(err) return deferred.reject(err);
        deferred.resolve(object);
      });
    } else {
      var sort = '';
      if(req.query.sort) sort = req.query.sort;

      var offset = 0;
      if(req.query.offset) offset = parseInt(req.query.offset);

      var limit = 0;
      if(req.query.limit) limit = parseInt(req.query.limit);

      var params = {};
      for(var k in req.query) {
        if(["sort", "populate", "columns", "offset", "limit"].indexOf(k) > -1) continue;
        var v = req.query[k];
        if(v == '') v = null;
        if(typeof v == "string" && v.toLowerCase() == 'true') v = true;
        if(typeof v == "string" && v.toLowerCase() == 'false') v = false;
        if(typeof v == "string" && v.charAt(0) === '!'){
          v = v.slice(1);
          params[k] = {$ne:v};
        } else {
          params[k] = v;
        }
      }
      Model.count(params).exec(function(err, count) {
        if(err) return deferred.reject(err);
        res.set('X-Total', count);
        if(limit) res.set('X-Total-Pages', Math.ceil(count/limit));
        Model.find(params,columns).populate(populate).sort(sort).skip(offset).limit(limit).exec(function(err, objects) {
          if(err) return deferred.reject(err);
          return deferred.resolve(objects);
        });
      });
    }
    return deferred.promise;
  };

  var post = function(req, res) {
    if(!req) throw "no Request object specified";
    if(!res) throw "no Response object specified";
    var deferred = Q.defer();
    Model.create(req.body, function(err, new_object) {
      if(err) deferred.reject(err);
      deferred.resolve(new_object);
    }); 
    return deferred.promise;
  };

  var update = function(req, res) {
    if(!req) throw "no Request object specified";
    if(!res) throw "no Response object specified";
    var deferred = Q.defer();
    Model.findById(req.params[object_id_parameter], function(err, object) {
      if(err) return deferred.reject(err);
      for(var k in req.body) {
        if(["_id", "__v"].indexOf(k) > -1) continue;
        object[k] = req.body[k];
      }
      object.save(function(err, saved_object) {
        if(err) return deferred.reject(err);
        deferred.resolve(saved_object);
      });
    });
    return deferred.promise;
  };

  var remove = function(req, res) {
    if(!req) throw "no Request object specified";
    if(!res) throw "no Response object specified";
    var deferred = Q.defer();
    Model.findByIdAndRemove(req.params[object_id_parameter], function(err, removed_object) {
      if(err) deferred.reject(err);
      result = removed_object;
      if(result) result = true;
      deferred.resolve(result);
    });
    return deferred.promise;
  }

  var methods = {
    get: get,
    post: post
  };

  if(object_id_parameter) {
    methods.put = methods.patch = update;
    methods.delete = remove;
  }
  return methods;
}

module.exports = RestCrud

function RestCrud(Model, object_id_parameter, options) {
  if (!Model) throw "no Model specified";
  if (!options) options = {};

  var get = function (req, res) {
    if (!req) throw "no Request object specified";
    if (!res) throw "no Response object specified";

    var columns = null;
    if (req.query.columns) columns = req.query.columns.join(" ");

    var populate = "";
    if (req.query.populate) populate = req.query.populate.join(" ");

    if (object_id_parameter && req.params[object_id_parameter]) {
      return new Promise((resolve, reject) => {
        Model.findById(req.params[object_id_parameter], columns)
          .populate(populate)
          .exec(function (err, object) {
            if (err) return reject(err);
            resolve(object);
          });
      });
    } else {
      var sort = "";
      if (req.query.sort) sort = req.query.sort;

      var offset = 0;
      if (req.query.offset) offset = parseInt(req.query.offset);

      var limit = 0;
      if (req.query.limit) limit = parseInt(req.query.limit);

      var params = {};
      if (req.params.search_term) {
        if (!options.search_columns)
          throw new Error("No search columns specified in options");
        var pattern = new RegExp(".*" + req.params.search_term + ".*", "i");
        var search_params = [];
        for (var i = 0; i < options.search_columns.length; i++) {
          var new_search_param = {};
          new_search_param[options.search_columns[i]] = pattern;
          search_params.push(new_search_param);
        }
        params["$or"] = search_params;
      }
      for (var k in req.query) {
        if (["sort", "populate", "columns", "offset", "limit"].indexOf(k) > -1)
          continue;
        var v = req.query[k];
        if (v == "") v = null;
        if (typeof v == "string" && v.toLowerCase() == "true") v = true;
        if (typeof v == "string" && v.toLowerCase() == "false") v = false;
        if (typeof v == "string" && v.charAt(0) === "!") {
          v = v.slice(1);
          params[k] = { $ne: v };
        } else {
          params[k] = v;
        }
        if (typeof params[k] == "string" && params[k].indexOf(",") != -1) {
          params[k] = { $in: v.split(",") };
        }
      }
      return new Promise((resolve, reject) => {
        Model.countDocuments(params).exec(function (err, count) {
          if (err) return reject(err);
          res.set("X-Total", count);
          if (limit) res.set("X-Total-Pages", Math.ceil(count / limit));
          Model.find(params, columns)
            .populate(populate)
            .sort(sort)
            .skip(offset)
            .limit(limit)
            .exec(function (err, objects) {
              if (err) return reject(err);
              resolve(objects);
            });
        });
      });
    }
  };

  var post = function (req, res) {
    if (!req) throw "no Request object specified";
    if (!res) throw "no Response object specified";
    return new Promise((resolve, reject) => {
      Model.create(req.body, function (err, new_object) {
        if (err) return reject(err);
        resolve(new_object);
      });
    });
  };

  var update = function (req, res) {
    if (!req) throw "no Request object specified";
    if (!res) throw "no Response object specified";
    return new Promise((resolve, reject) => {
      Model.findById(req.params[object_id_parameter], function (err, object) {
        if (err) return reject(err);
        for (var k in req.body) {
          if (["_id", "__v"].indexOf(k) > -1) continue;
          object[k] = req.body[k];
        }
        object.save(function (err, saved_object) {
          if (err) return reject(err);
          resolve(saved_object);
        });
      });
    });
  };

  var remove = function (req, res) {
    if (!req) throw "no Request object specified";
    if (!res) throw "no Response object specified";
    return new Promise((resolve, reject) => {
      Model.findByIdAndRemove(
        req.params[object_id_parameter],
        function (err, removed_object) {
          if (err) return reject(err);
          result = removed_object;
          if (result) result = true;
          resolve(result);
        }
      );
    });
  };

  var methods = {
    get: get,
    post: post,
  };

  if (object_id_parameter) {
    methods.put = methods.patch = update;
    methods.delete = remove;
  }
  return methods;
}

module.exports = RestCrud;

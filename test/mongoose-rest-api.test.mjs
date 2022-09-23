var mongoose = require("mongoose");
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
var Q = require("q");
var ObjectId = mongoose.Types.ObjectId;
var Rest = require("../index.js");
var MongoMemoryServer = require("mongodb-memory-server").MongoMemoryServer;
var mongod = await MongoMemoryServer.create();
var conn;

var TestResponse = function () {
  this.headers = {};
};
TestResponse.prototype.set = function (header_name, value) {
  this.headers[header_name] = value;
};
TestResponse.prototype.append = function (header_name, value) {
  this.headers[header_name] = value;
};
TestResponse.prototype.get = function (header_name) {
  return this.headers[header_name];
};

chai.use(chaiAsPromised);
chai.should();
var expect = chai.expect;
assert = chai.assert;

var ModelSchema = new mongoose.Schema({
  name: { type: String },
  col_1: { type: String },
  col_2: { type: String },
  col_3: { type: Boolean },
  col_4: [{ type: String }],
  related_model: { type: mongoose.Schema.Types.ObjectId, ref: "Model" },
});
var Model = mongoose.model("Model", ModelSchema);

describe("Rest CRUD Library", function () {
  var models, model;
  var req, res;

  before(function (done) {
    mongod.getUri().then((uri) => {
      conn = mongoose.connect(uri).then(
        function () {
          done();
        },
        function (err) {
          console.log("ERR:", err);
        }
      );
    });
  });

  beforeEach(function (done) {
    req = { body: {}, params: {}, query: {} };
    res = new TestResponse();
    model_params = [
      { name: "Model 1", col_1: "M1 Col 1", col_2: "AAAAA", col_4: ["a", "b"] },
      { name: "Model 2", col_1: "M2 Col 1", col_2: "CCCCC", col_4: ["c", "d"] },
      { name: "Model 3", col_1: "M3 Col 1", col_2: "CCCCC", col_4: ["e", "f"] },
    ];
    Model.create(model_params, function (err, new_models) {
      if (err) throw err;
      models = new_models;
      model = new_models[0];
      model.related_model = new_models[1]._id;
      model.save(function (err, saved_model) {
        if (err) throw err;
        model = saved_model;
        done();
      });
    });
  });

  afterEach(function (done) {
    mongoose.connection.db.dropDatabase(function () {
      done();
    });
  });

  it("requires a mongoose model as its first argument", function () {
    var errored = false;
    try {
      Rest();
    } catch (err) {
      errored = true;
    }
    expect(errored).to.equal(true);
  });

  it("returns a hash containing functions", function () {
    var RestCrud = Rest(Model);
    for (var k in RestCrud) {
      expect(typeof RestCrud[k]).to.equal("function");
    }
  });

  it("with object_id_param returns get, post, put, patch and delete options", function () {
    var RestCrud = Rest(Model, "model_id");
    expect(typeof RestCrud.get).to.equal("function");
    expect(typeof RestCrud.post).to.equal("function");
    expect(typeof RestCrud.put).to.equal("function");
    expect(typeof RestCrud.patch).to.equal("function");
    expect(typeof RestCrud.delete).to.equal("function");
  });

  it("without object_id_param returns get and post options", function () {
    var RestCrud = Rest(Model);
    expect(typeof RestCrud.get).to.equal("function");
    expect(typeof RestCrud.post).to.equal("function");
    expect(RestCrud.put).to.not.exist;
    expect(RestCrud.patch).to.not.exist;
    expect(RestCrud.delete).to.not.exist;
  });

  describe("get method", function () {
    var restget;
    beforeEach(function () {
      restget = Rest(Model, "object_id").get;
    });

    it("requires request object as first argument", function () {
      var errored = false;
      try {
        restget();
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("requires response object as second argument", function () {
      var errored = false;
      try {
        restget(req);
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("returns promise", function () {
      var promise = restget(req, res);
      expect(typeof promise.then).to.equal("function");
    });

    describe("without object_id", function () {
      it("promise resolves with array of Models", function () {
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result).to.exist;
          expect(result.length).to.equal(models.length);
          for (var i = 0; i < result.length; i++) {
            expect(result[i].name).to.exist;
            expect(result[i].col_1).to.exist;
            expect(result[i].col_2).to.exist;
          }
        });
      });

      it("with columns query parameter will only populate specified columns", function () {
        req.query.columns = ["name"];
        var promise = restget(req, res);
        return promise.then(function (result) {
          for (var i = 0; i < result.length; i++) {
            var model = result[i];
            expect(model.name).to.exist;
            expect(model.col_1).to.not.exist;
            expect(model.col_2).to.not.exist;
          }
        });
      });

      it("with populate query parameter will populate specified columns", function () {
        req.query.populate = ["related_model"];
        var promise = restget(req, res);
        return promise.then(function (result) {
          for (var i = 0; i < result.length; i++) {
            if (model._id.toString() != result[i]._id.toString()) continue;
            expect(result[i].related_model).to.exist;
            expect(result[i].related_model._id).to.exist;
          }
        });
      });

      it("with sort query parameter will return objects sorted by specified columns", function () {
        req.query.sort = "col_2 -name";
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result[0].name).to.equal("Model 1");
          expect(result[1].name).to.equal("Model 3");
          expect(result[2].name).to.equal("Model 2");
        });
      });

      it("with query parameters matching column names will return objects filtered by column names", function () {
        req.query.name = "Model 2";
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result.length).to.equal(1);
          expect(result[0].name).to.equal("Model 2");
        });
      });

      it("with query parameters matching column names, preceded by !, will return objects negative-filtered by column names", function () {
        req.query.name = "!Model 2";
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result.length).to.equal(2);
          expect(result[0].name).not.to.equal("Model 2");
          expect(result[1].name).not.to.equal("Model 2");
        });
      });

      it("with null query parameter objects filtered by null column names", function () {
        model.col_2 = null;
        var deferred = Q.defer();
        model.save(function (err, saved_model) {
          if (err) throw err;
          model = saved_model;
          req.query.col_2 = "";
          var promise = restget(req, res);
          promise.then(function (result) {
            deferred.resolve(result);
          });
        });
        return deferred.promise.then(function (result) {
          expect(result.length).to.equal(1);
          expect(result[0].name).to.equal("Model 1");
        });
      });

      it("with query parameter value having comma delimited values objects returned will only match those specified", function () {
        var deferred = Q.defer();
        req.query.col_1 = "M1 Col 1,M2 Col 1";
        var promise = restget(req, res);
        promise.then(function (result) {
          deferred.resolve(result);
        });
        return deferred.promise.then(function (result) {
          expect(result.length).to.equal(2);
          let m1_found = false;
          let m2_found = false;
          for (let i = 0; i < result.length; i++) {
            if (result[i].col_1 == "M1 Col 1") m1_found = true;
            if (result[i].col_1 == "M2 Col 1") m2_found = true;
          }
          expect(m1_found).to.equal(true);
          expect(m2_found).to.equal(true);
        });
      });

      it("with 'true' or 'TRUE' query parameter objects filtered by boolean true column names", function () {
        model.col_3 = true;
        var deferred = Q.defer();
        model.save(function (err, saved_model) {
          if (err) throw err;
          model = saved_model;
          req.query.col_3 = "True";
          var promise = restget(req, res);
          promise.then(function (result) {
            deferred.resolve(result);
          });
        });
        return deferred.promise.then(function (result) {
          expect(result.length).to.equal(1);
          expect(result[0].name).to.equal("Model 1");
        });
      });

      it("with 'false' or 'FALSE' query parameter objects filtered by boolean false column names", function () {
        model.col_3 = false;
        var deferred = Q.defer();
        model.save(function (err, saved_model) {
          if (err) throw err;
          model = saved_model;
          req.query.col_3 = "False";
          var promise = restget(req, res);
          promise.then(function (result) {
            deferred.resolve(result);
          });
        });
        return deferred.promise.then(function (result) {
          expect(result.length).to.equal(1);
          expect(result[0].name).to.equal("Model 1");
        });
      });

      describe("with offset param", function () {
        it("returns list offset by specified amount", function () {
          req.query.offset = 1;
          return restget(req, res).then(function (result) {
            expect(result.length).to.equal(2);
          });
        });

        it("modifies response object to include X-Total header", function () {
          req.query.offset = 1;
          return restget(req, res).then(function (result) {
            expect(res.get("X-Total")).to.equal(3);
          });
        });
      });

      describe("with limit param", function () {
        it("returns list limited by specified amount", function () {
          req.query.limit = 1;
          return restget(req, res).then(function (result) {
            expect(result.length).to.equal(1);
          });
        });

        it("modifies response object to include X-Total header", function () {
          req.query.limit = 1;
          return restget(req, res).then(function (result) {
            expect(res.get("X-Total")).to.equal(3);
          });
        });

        it("modifies response object to include X-Total-Pages header", function () {
          req.query.limit = 2;
          return restget(req, res).then(function (result) {
            expect(res.get("X-Total-Pages")).to.equal(2);
          });
        });
      });
    });

    describe("with object_id", function () {
      it("promise resolves with specified model", function () {
        req.params.object_id = model._id;
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result).to.exist;
          expect(result._id.toString()).to.equal(model._id.toString());
        });
      });

      it("with columns query parameter will only populate specified columns", function () {
        req.query.columns = ["name"];
        req.params.object_id = model._id;
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result.name).to.exist;
          expect(result.col_1).to.not.exist;
          expect(result.col_2).to.not.exist;
        });
      });

      it("with populate query parameter will populate specified columns", function () {
        req.query.populate = ["related_model"];
        req.params.object_id = model._id;
        var promise = restget(req, res);
        return promise.then(function (result) {
          expect(result.related_model).to.exist;
          expect(result.related_model._id).to.exist;
        });
      });
    });
  });

  describe("post method", function () {
    var restpost;
    beforeEach(function () {
      restpost = Rest(Model, "object_id").post;
    });

    it("requires request object as first argument", function () {
      var errored = false;
      try {
        restpost();
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("requires response object as second argument", function () {
      var errored = false;
      try {
        restpost(req);
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("returns promise", function () {
      var promise = restpost(req, res);
      expect(typeof promise.then).to.equal("function");
    });

    it("promise resolves with new object having fields matching request body", function () {
      req.body = {
        name: "Model 4",
        col_1: "M 4 Col 1",
        col_2: "ZZZZZZZ",
      };
      var promise = restpost(req, res);
      return promise.then(function (result) {
        expect(result._id).to.exist;
        expect(result.name).to.equal(req.body.name);
        expect(result.col_1).to.equal(req.body.col_1);
        expect(result.col_2).to.equal(req.body.col_2);
      });
    });

    it("with related field specified as object, will successfully set the related object field", function () {
      req.body = {
        name: "Model 4",
        col_1: "M 4 Col 1",
        col_2: "ZZZZZZZ",
        related_model: model.toObject(),
      };
      var promise = restpost(req, res);
      return promise.then(function (result) {
        expect(result._id).to.exist;
        expect(result.related_model.toString()).to.equal(model._id.toString());
      });
    });
  });

  describe("put, patch methods", function () {
    var restpatch;
    beforeEach(function () {
      restpatch = Rest(Model, "object_id").patch;
    });

    it("requires request object as first argument", function () {
      var errored = false;
      try {
        restpatch();
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("requires response object as second argument", function () {
      var errored = false;
      try {
        restpatch(req);
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("returns promise", function () {
      req.params.object_id = model._id.toString();
      var promise = restpatch(req, res);
      expect(typeof promise.then).to.equal("function");
    });

    it("promise resolves to specified object, with specified fields updated", function () {
      req.params.object_id = model._id.toString();
      req.body.col_1 = "NEW COLUMN 1 VALUE";
      req.body.col_2 = "NEW COLUMN 2 VALUE";
      var promise = restpatch(req, res);
      return promise.then(function (result) {
        expect(result._id.toString()).to.equal(model._id.toString());
        expect(result.name).to.equal(model.name);
        expect(result.col_1).to.equal(req.body.col_1);
        expect(result.col_2).to.equal(req.body.col_2);
      });
    });

    it("when array field set to empty array, promise resolves to specified object, with specified array fields updated", function () {
      req.params.object_id = model._id.toString();
      req.body.col_4 = [];
      var promise = restpatch(req, res);
      return promise.then(function (result) {
        expect(result._id.toString()).to.equal(model._id.toString());
        expect(result.name).to.equal(model.name);
        expect(result.col_4.length).to.equal(0);
      });
    });

    it("will not update _id and __v fields", function () {
      req.params.object_id = model._id.toString();
      req.body._id = "NEW ID!!!!!";
      req.body.__v = "NEW VERSION!!!!!";
      var promise = restpatch(req, res);
      return promise.then(function (result) {
        expect(result._id.toString()).to.equal(model._id.toString());
        expect(result.__v.toString()).to.equal(model.__v.toString());
      });
    });
  });

  describe("delete method", function () {
    var restdelete;
    beforeEach(function () {
      restdelete = Rest(Model, "object_id").delete;
    });

    it("requires request object as first argument", function () {
      var errored = false;
      try {
        restdelete();
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("requires response object as second argument", function () {
      var errored = false;
      try {
        restdelete(req);
      } catch (err) {
        errored = true;
      }
      expect(errored).to.be.true;
    });

    it("returns promise", function () {
      req.params.object_id = model._id.toString();
      var promise = restdelete(req, res);
      expect(typeof promise.then).to.equal("function");
    });

    it("promise resolves to true on success", function () {
      req.params.object_id = model._id.toString();
      var promise = restdelete(req, res);
      var delete_deferred = Q.defer();
      promise.then(function (result) {
        Model.findById(model._id, function (err, object) {
          if (err) throw err;
          delete_deferred.resolve(object);
        });
      });
      return Q.all([promise, delete_deferred.promise]).then(function (results) {
        expect(results[0]).to.be.true;
        expect(results[1]).to.be.null;
      });
    });

    it("promise resolves to null if object not found", function () {
      req.params.object_id = new ObjectId().toString();
      var promise = restdelete(req, res);
      return promise.then(function (result) {
        expect(result).to.be.null;
      });
    });
  });

  //  after(function(done) {
  //    mongoose.unmock(function() {
  //      done();
  //    });
  //  })
});

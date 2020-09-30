# mongoose-rest-api

A generator for REST API business logic for use with Express.js. Given a Mongoose model and a unique ID name, mongoose-rest-api will generate a set of methods that can be used directly with Express.js routes. Separating the logic into distinct methods in this way exposes a clean, testable surface, independent of the Express http request handling. In addition, this gives you a nice way to keep your library of business logic DRY by reusing and expanding upon the individual methods.

Each method returns a promise which resolves to the result of the request. Once these endpoint functions are linked up to an Express.js route, the result will be automatically generated routes like the following examples:

- `GET /widgets` Return a list of widgets
- `GET /widgets/WIDGET_ID` Return a specific widget, given it's ID
- `GET /widgets?color=blue` Return a list of widgets with the `color` attribute `'blue'`
- `GET /widgets?color=!blue` Returns a list of widgets that have any color but blue
- `GET /widgets?sort=-age` Returns a list of widgets sorted by their `age` attribute in reverse order
- `POST /widgets` Given a request body, will create a new Widget and respond with it
- `PUT /widgets/WIDGET_ID` Given a request body will modify the Widget specified by WIDGET_ID and respond with the modified version
- `DELETE /widget/WIDGET_ID` Deletes the widget specified by WIDGET_ID and respond with the object as it was before its deletion

## Installation

`npm install mongoose-rest-api --save`

## Generated Endpoints

|Endpoint Name|Description|Promise Resolution|
|-------------|-----------|------------------|
|get|Respond with specified resource, or list of resources, unmodified.|If the request includes a resource identifier, the promise will resolve to the specified resource, otherwise it will resolve to a list of resources. If `req.params.search_term` is provided, the list will be filtered according to the search term.|
|post|Create a new resource from the Request body|Promise resolves the newly created resource|
|put, patch|Modifies a specified resource|Promise resolves to the modified resource|
|delete|Deletes a specified resource|Promise resolves to the deleted resource as it was before the deletion|

## Accepted req.query parameters

### Get with ID

|Parameter|Type|Description|
|---------|----|-----------|
|columns|Array|A list of columns to include on resource. By default, all visible columns will be included|
|populate|Array|A list of related objects to populate. By default only the id of the related object will be included|

### Get without ID

|Parameter|Type|Description|
|---------|----|-----------|
|Any Column Name|String|Given a column name as the key, and a value, the resulting list will be AND filtered to match. Column values preceded with a `!` will be negatively matched. Column values delimited by commas will result in an array of matching objects|
|columns|Array|A list of columns to include on resource. By default, all visible columns will be included|
|populate|Array|A list of related objects to populate. By default only the id of the related object will be included|
|limit|Number|Number of resources to include in response. Useful for pagination. This would be the number of items per page.|
|offset|Number|Offset of the first resource to include in list. Useful for pagination. This would indicate which page to start on.|
|sort|String|Column(w) to sort on. Columns prefixed by a `-`, this will perform a Descending sort.|

## Examples

### Basic Usage

```js
// Express.js route file: routes/widgets.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Widget = mongoose.Model('Widget');
const Rest = require('mongoose-rest-api');

const endpoints = Rest(Widget, 'widget_id'); // 'widget_id' is used to identify the ID parameter in our route definitions

router.get('/', function(req, res, next) {
    methods.get(req, res).then(result => {
        return res.status(200).json(result);
    }, err => {
        return next(err);
    });
});

router.get('/:widget_id', function(req, res, next) { // note that :widget_id matches the second argument of Rest()
    endpoints.get(req, res).then(result => {
        if(result) {
            return res.status(200).json(result);
        } else {
            return res.sendStatus(404);
        }
    }, err => {
        return next(err);
    });
});

router.post('/', function(req, res, next) {
    endpoints.post(req, res).then(result => {
        return res.status(201).json(result);
    }, err => {
        return next(err);
    });
});

router.patch('/:widget_id', function(req, res, next) {
    endpoints.patch(req, res).then(result => {
        if(result) {
            return res.status(200).json(result);
        } else {
            return res.sendStatus(404);
        }
    }, err => {
        return next(err);
    });
});

router.delete('/:widget_id', function(req, res, next) {
    endpoints.delete(req, res).then(result => {
        return res.status(200).json(result);
    }, err => {
        return res.sendStatus(200);
    });
});
```

### Parameter Validation

```js
// Express.js route file: routes/widgets.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Widget = mongoose.Model('Widget');
const Q = require('q');
const Rest = require('mongoose-rest-api');

const endpoints = Rest(Widget, 'widget_id');

const myPost = function(req, res) {
    let deferred = Q.defer();
    validate_widget(req.body).then(result => { // validate_widget() defined elsewhere
        endpoints.post(req, res).then(result => deferred.resolve(result), err => deferred.reject(err));
    }, err => {
        deferred.reject(err);
    });
    return deferred.promise;
}

router.post('/', function(req, res, next) {
    myPost(req, res).then(result => { // Note we use myPost here instead of endpoints.post
        return res.status(200).json(result);
    }, err => {
        return next(err);
    });
});
```

### Endpoint Composition

Using the generated endpoints, it is simple to compose them in combinations. In the following
Example, a Widget has a one-to-many relationship with Doodads.

```js
// Express.js route file: routes/widgets.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Widget = mongoose.Model('Widget');
const Doodad = mongoose.Model('Doodad');
const Rest = require('mongoose-rest-api');

const widget_endpoints = Rest(Widget, 'widget_id'); // 'widget_id' is used to identify the ID parameter in our route definitions
const doodad_endpoints = Rest(Doodad, 'doodad_id'); // 'doodad_id' is used to identify the ID parameter in our route definitions

router.get('/', function(req, res, next) {
    widget_endpoints.get(req, res).then(result => {
        return res.status(200).json(result);
    }, err => {
        return next(err);
    });
});

router.get('/:widget_id', function(req, res, next) { // note that :widget_id matches the second argument of Rest()
    widget_endpoints.get(req, res).then(result => {
        if(result) {
            return res.status(200).json(result);
        } else {
            return res.sendStatus(404);
        }
    }, err => {
        return next(err);
    });
});

router.get('/:widget_id/doodads', function(req, res, next) {
    req.query.widget = req.params.widget_id; // Here we add a query parameter which filters the results to
                                             // Doodads with the attribute widget equal to the specified
                                             // :widget_id
    doodad_endpoints.get(req, res).then(result => {
        return res.status(200).json(result);
    }, err => {
        return next(err);
    });
});

router.get('/:widget_id/doodads/:doodad_id', function(req, res, next) {
    doodad_endpoints.get(req, res).then(result => {
        if(result) {
            if(result.widget != req.params.widget_id) return res.status(400).json({"error": "Doodad does not belong to specified Widget!"})
            return res.status(200).json(result);
        } else {
            return res.sendStatus(404);
        }
    }, err => {
        return next(err);
    });
});

router.post('/', function(req, res, next) {
    widget_endpoints.post(req, res).then(result => {
        return res.status(201).json(result);
    }, err => {
        return next(err);
    });
});

// In this example, each widget is only allowed a maximum number of Doodads. Our logic ensures this limit is not exceeded

router.post('/:widget_id/doodads', function(req, res, next) {
    widget_endpoints.get(req, res).then(result => {
      if(widget.max_doodads == widget.doodads.length) return res.status(400).json({"error": "Widget is already at Doodad limit"})
      doodad_endpoints.post(req, res).then(result => {
          return res.status(201).json(result);
      }, err => {
          return next(err);
      });
    }, err => {
        return next(err);
    });
    req.body.widget = req.params.widget_id; // Here we add or override the body parameter 'widget' with
                                            // the specified :widget_id
});

router.patch('/:widget_id', function(req, res, next) {
    widget_endpoints.patch(req, res).then(result => {
        if(result) {
            return res.status(200).json(result);
        } else {
            return res.sendStatus(404);
        }
    }, err => {
        return next(err);
    });
});

router.delete('/:widget_id', function(req, res, next) {
    widget_endpoints.delete(req, res).then(result => {
        return res.status(200).json(result);
    }, err => {
        return res.sendStatus(200);
    });
});
```

## Changelog

**1.2.4**

- Security update. Updated lodash to version 4.17.19

**1.2.3**

- Updated README to highlight endpoint composition

**1.2.2**

- Security Update. Updated dependencies to elimnate known vulnerabilities

**1.2.1**

- Updated tests to use mongodb-memory-server instead of mockgoose 

**1.2.0**

- Added ability to specify multiple values for a column in GET queries

**1.1.0**

- Added search functionality to generated get endpoint

**1.0.5**

- Bugfix: offset and limit query parameters were being interpreted as strings

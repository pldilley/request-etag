'use strict';

var Cache = require('./cache');
var assign = require('lodash.assign');
var cloneDeep = require('lodash.clonedeep');

function getHeaderValue(headers, name) {
  var value;
  Object.keys(headers || {}).forEach(function (key) {
    if (key.toLowerCase() === name) {
      value = headers[key];
    }
  });
  return value;
}

function parseParameters(uri, options, callback) {
  if (typeof options === 'object') {
    return {
      options: assign(options, { uri: uri }),
      callback: callback
    };
  }
  if (typeof uri === 'string') {
    if (typeof callback === 'function') {
      return {
        options: { uri: uri },
        callback: callback
      };
    }
    return {
      options: { uri: uri },
      callback: options
    };
  }
  return {
    options: uri,
    callback: options
  };
}

function getHttpClient(cache, wrappedHttpClient) {
  function httpClient(uri, options, callback) {
    var parameters = parseParameters(uri, options, callback);
    if (parameters.options.method && parameters.options.method.toLowerCase() !== 'get') {
      return wrappedHttpClient(parameters.options, parameters.callback);
    }

    parameters.options.headers = parameters.options.headers || {};
    if (getHeaderValue(parameters.options.headers, 'cookie')) {
      return wrappedHttpClient(parameters.options, parameters.callback);
    }

    var cacheKey = cloneDeep(parameters.options);
    var cacheHit = cache.get(cacheKey);
    if (cacheHit) {
      parameters.options.headers['If-None-Match'] = cacheHit.etag;
    }

    return wrappedHttpClient(parameters.options, function (error, response, body) {
      if (response.statusCode === 200 || response.statusCode === 304 || !error) {
        if (response.statusCode === 200) {
          var etag = getHeaderValue(response.headers, 'etag');
          if (etag) {
            cache.set(cacheKey, { data: cloneDeep(body || response.body), etag: etag });
          }
        }
        if (response.statusCode === 304) {
          body = cloneDeep(cacheHit.data);
          error = null;
        }
      }
      parameters.callback(error, response, body || response.body);
    });
  }

  httpClient.reset = cache.reset;
  return httpClient;
}

function Request(cacheConfig, baseHttpClient) {
  if (!baseHttpClient) {
      throw new Error('Must supply base http client (e.g. "require(\'request\')"');
  }

  var cache = new Cache(cacheConfig);
  return getHttpClient(cache, baseHttpClient);
}

module.exports = Request;

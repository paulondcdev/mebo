// the modules bellow are optional integrations, only required as devDependencies
// for testing purpose
const request = require('request'); // eslint-disable-line
const express = require('express'); // eslint-disable-line
const passport = require('passport'); // eslint-disable-line
const BasicStrategy = require('passport-http').BasicStrategy; // eslint-disable-line
// regular modules
const assert = require('assert');
const Mebo = require('../../../src');
const testutils = require('../../../testutils');

const Action = Mebo.Action;
const Settings = Mebo.Settings;


describe('Web Upload:', () => {

  let server = null;
  let app = null;
  let port = null;

  class DisableRestrictWebAccessAction1 extends Action{
    constructor(){
      super();
      this.createInput('a: text');
      this.createInput('file: filePath', {allowedExtensions: ['bin'], restrictWebAccess: false});
    }

    _perform(data){
      return Promise.resolve({
        a: data.a,
        file: data.file,
      });
    }
  }

  class DisableRestrictWebAccessAction2 extends testutils.Actions.Shared.UploadAction{
    constructor(){
      super();
      this.input('file').assignProperty('restrictWebAccess', false);
    }
  }

  before((done) => {

    // registrations
    Mebo.Action.register(testutils.Actions.Shared.UploadAction, 'uploadAction');
    Mebo.Action.register(testutils.Actions.Shared.VectorUploadAction, 'vectorUploadAction');
    Mebo.Action.register(DisableRestrictWebAccessAction1, 'disableRestrictWebAccessAction1');
    Mebo.Action.register(DisableRestrictWebAccessAction2, 'disableRestrictWebAccessAction2');

    // webfying actions
    Mebo.Handler.grantAction('web', 'uploadAction', {method: 'post', restRoute: '/E'});
    Mebo.Handler.grantAction('web', 'vectorUploadAction', {method: 'post', restRoute: '/E/VectorUploadAction'});
    Mebo.Handler.grantAction('web', 'disableRestrictWebAccessAction1', {method: 'post', auth: false, restRoute: '/E/DisableRestrictWebAccessAction1'});
    Mebo.Handler.grantAction('web', 'disableRestrictWebAccessAction2', {method: 'post', auth: false, restRoute: '/E/DisableRestrictWebAccessAction2'});

    // auth
    passport.use(new BasicStrategy(
      (username, password, authDone) => {
        if (username.valueOf() === 'user'
          && password.valueOf() === '1234'){
          return authDone(null, 'user');
        }
        return authDone(null, false);
      },
    ));

    // express server
    app = express();
    app.use(passport.initialize());
    server = app.listen(0, () => {
      done();
    });

    Mebo.Handler.get('web').restful(app);

    port = server.address().port;
  });

  after(() => {
    if (server){
      server.close();
    }
  });

  it('Should fail to perform an action through POST where the file is defined as string rather than coming from a upload', (done) => {
    request.post(`http://localhost:${port}/E`, {
      form: {
        a: 'A value',
        file: '/a/custom/filePath.bin',
      },
    }, (err, response, body) => {

      if (err){
        return done(err);
      }

      let error = null;

      try{
        assert.equal(response.statusCode, Settings.get('error/validationFail/status'));
      }
      catch(errr){
        error = errr;
      }

      done(error);
    });
  });

  it("Should perform an action through POST where the file can be defined as string and 'restrictWebAccess' is set to false", (done) => {

    request.post(`http://localhost:${port}/E/DisableRestrictWebAccessAction1`, {
      form: {
        a: 'A value',
        file: '/a/custom/filePath.bin',
      },
    }, (err, response, body) => {

      if (err){
        return done(err);
      }

      let error = null;

      try{
        assert.equal(response.statusCode, 200);

        const result = JSON.parse(body);
        assert.equal(result.data.a, 'A value');
        assert.equal(result.data.file, '/a/custom/filePath.bin');
      }
      catch(errr){
        error = errr;
      }

      done(error);
    });
  });

  it("Should perform an action through POST where the file is uploaded and 'restrictWebAccess' is set to false", (done) => {

    const postFormData = {
      a: 'A value',

      file: {
        value: Buffer.from([1, 2, 3]),
        options: {
          filename: 'foo.bin',
          contentType: 'application/bin',
        },
      },
    };

    request.post(`http://localhost:${port}/E/DisableRestrictWebAccessAction2`, {formData: postFormData}, (err, response, body) => {

      if (err){
        return done(err);
      }

      let error = null;
      try{
        assert.equal(response.statusCode, 200);

        const result = JSON.parse(body);
        assert.equal(result.data.a, 'A value');
        assert.equal(result.data.fileHash, '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
      }
      catch(errr){
        error = errr;
      }

      done(error);
    });
  });

  it('Should perform an action through POST with single file upload (keeping the original name)', (done) => {

    const postFormData = {
      a: 'A value',

      file: {
        value: Buffer.from([1, 2, 3]),
        options: {
          filename: 'foo|:?*"\0<>.bin',
          contentType: 'application/bin',
        },
      },
    };

    request.post({url: `http://localhost:${port}/E`, formData: postFormData}, (err, response, body) => {

      if (err){
        return done(err);
      }

      let error = null;

      try{
        assert.equal(response.statusCode, 200);

        const result = JSON.parse(body);
        assert.equal(result.data.fileHash, '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
        assert.equal(result.data.fileName, 'foo________.bin');
        assert.equal(result.data.a, postFormData.a);
      }
      catch(errr){
        error = errr;
      }

      done(error);
    });
  });

  it('Should perform an action through POST by uploading multiple files for the same input (vector) keeping the file names', (done) => {

    const postFormData = {
      // Pass a simple key-value pair
      a: 'A value',

      file: [
        {
          value: Buffer.from([1, 2, 3]),
          options: {
            filename: 'foo.bin',
            contentType: 'application/bin',
          },
        },
        {
          value: Buffer.from([1, 2]),
          options: {
            filename: 'foo1.bin',
            contentType: 'application/bin',
          },
        },
        {
          value: Buffer.from([1, 2]),
          options: {
            filename: 'foo2.bin',
            contentType: 'application/bin',
          },
        },
      ],
    };

    request.post({url: `http://localhost:${port}/E/VectorUploadAction`, formData: postFormData}, (err, response, body) => {

      if (err){
        return done(err);
      }

      let error = null;

      try{
        assert.equal(response.statusCode, 200);

        const result = JSON.parse(body);
        assert.equal(result.data.a, postFormData.a);
        assert.equal(result.data['foo.bin'], '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
        assert.equal(result.data['foo1.bin'], 'a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222');
        assert.equal(result.data['foo2.bin'], 'a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222');
      }
      catch(errr){
        error = errr;
      }

      done(error);
    });
  });
});

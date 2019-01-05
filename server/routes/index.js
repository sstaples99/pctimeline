const express = require('express');
const Dropbox = require('dropbox').Dropbox;
const fetch = require('isomorphic-fetch');
const _ = require('lodash');
const multiparty = require('multiparty');
const fs = require('fs');
const sizeOf = require('image-size');

const dbx = new Dropbox({ accessToken: 'b31IOz_iVoAAAAAAAAAAwkfekfZhZ0jq9U_zThq1v0TbCGoOMpIiKRPExvgO4kQJ', fetch: fetch });
const router = express.Router();

module.exports = (db) => {
  router.get('/galleries', async (req, res) => {
    const response = await dbx.filesListFolder({ path: '/galleries' });
    const { entries } = response;
    const folders = _.filter(entries, entry => entry['.tag'] === 'folder');
    const galleries = [];

    for (const folder of folders) {
      const files = await dbx.filesListFolder({ path: folder.path_lower });
      const images = _.filter(files.entries, entry => entry['.tag'] === 'file');
      let headerImage = images[0];
      headerImage = _.find(images,  image => _.includes(image.name, 'header')) || headerImage;
      const headerImgSrc = await dbx.filesGetTemporaryLink({ path: headerImage.path_lower });
      const formattedFolder = _.pick(folder, ['name', 'path_lower']);
      formattedFolder.header = headerImgSrc.link;
      galleries.push(formattedFolder);
    }
    
    return res.send(galleries);
  });

  router.get('/photos/:id', async (req, res) => {
    const path = `/galleries/${req.params.id}`;
    const response = await dbx.filesListFolder({ path });
    const { entries } = response;
    const files = _.filter(entries, entry => entry['.tag'] === 'file');
    const fileSources = _.map(files, file => dbx.filesGetTemporaryLink({ path: file.path_lower }));
    const sources = await Promise.all(fileSources);
    const sourceLinks = _.map(sources, (source, idx) => {
      const name = files[idx].name;
      const [width, height] = name.match(/(?<=_)[0-9]+x[0-9]+(?=\.)/g)[0].split('x');
      return {
        src: source.link,
        width,
        height
      };
    });
    res.send(sourceLinks);
  });

  router.post('/photos/:id', async (req, res) => {
    const path = `/galleries/${req.params.id}`;
    const form = new multiparty.Form();
    let files;
    form.parse(req, async (err, fields, filesIn) => {
      if (err) {
        return res.send({ success: false, err });
      }
      const files = _.values(filesIn);
      console.log(files);
      for (const file of files) {
        try {
          const fileData = fs.readFileSync(file[0].path);
          const { width, height } = sizeOf(file[0].path);
          const imageName = file[0].originalFilename.toLowerCase().match(/.+(?=.(jpg|jpeg|png))/g)[0];
          const fileExtensionRegEx = new RegExp(`(?<=${imageName}\.).+`, 'g');
          const fileExtension = file[0].originalFilename.toLowerCase().match(fileExtensionRegEx)[0];
          const filePath = `${path}/${imageName}_${width}x${height}.${fileExtension}`;
          await dbx.filesUpload({ path: filePath, contents: fileData });
        } catch (err) {
          console.log(err);
        }
      }
      return res.send({ success: true });
    });
  });

  return router;
};
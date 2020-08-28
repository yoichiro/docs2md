const { google } = require('googleapis');
const fs = require('fs');
const http = require('https');

const IMAGE_PREFIX = 'ergodash';

const JWT = google.auth.JWT;
const keys = require('./docs2md-481f15365566.json');
const jwtClient = new JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/documents.readonly']
);
jwtClient.authorize((err, tokens) => {
  if (err) {
    console.error(err);
    return;
  }
  const docs = google.docs({
    version: 'v1',
    auth: jwtClient
  });
  docs.documents.get({
    documentId: '1YqzP6fyfq0GZUGSFqkszup8LXtPdVHjVoadUFKy-LW4'
  }, (err1, res) => {
    if (err1) {
      console.error(err1);
      return;
    }
    try {
      fs.mkdirSync('./dist');
    } catch(_e) {
    }
    const lines = [];
    let imageIndex = 1;
    res.data.body.content.forEach(items => {
      if (items.paragraph) {
        if (items.paragraph.paragraphStyle.namedStyleType === 'NORMAL_TEXT') {
          items.paragraph.elements.forEach(element => {
            if (element.textRun) {
              lines.push(element.textRun.content);
            } else if (element.inlineObjectElement) {
              const inlineObject = res.data.inlineObjects[element.inlineObjectElement.inlineObjectId];
              try {
                fs.mkdirSync('./dist/images');
              } catch(_e) {
              }
              const filename = `${IMAGE_PREFIX}-${imageIndex++}.png`;
              const file = fs.createWriteStream(`./dist/images/${filename}`);
              http.get(
                inlineObject.inlineObjectProperties.embeddedObject.imageProperties.contentUri, response => {
                  response.pipe(file);
                });
              lines.push(`\n![]({{ "/images/2020/08/${filename}" | prepend: site.baseurl }})\n`);
            }
          });
        } else if (items.paragraph.paragraphStyle.namedStyleType === 'HEADING_1') {
          const heads = items.paragraph.elements.map(element => {
            if (element.textRun) {
              return element.textRun.content;
            } else {
              return null;
            }
          }).filter(x => x !== null);
          lines.push(`# ${heads.join('')}\n`);
        }
      }
    });
    try {
      fs.writeFileSync('./dist/post.md', lines.join(''));
    } catch(e) {
      console.error(e);
    }
  });
});

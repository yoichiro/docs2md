const { google } = require('googleapis');
const fs = require('fs');
const http = require('https');

const IMAGE_FILENAME_PREFIX = 'ergodash-2';
const IMAGE_PATH = '/images/2020/08/';
const DOCUMENT_ID = '1p_tAncO8eux4lAvkqBrQ4fZ-LZF_6abAwrnogjCU1Gc';
const SERVICE_ACCOUNT_KEY_FILE = './docs2md-481f15365566.json';
const MARKDOWN_FILENAME = '2020-08-31-ergodash_2.md';

const JWT = google.auth.JWT;
const keys = require(SERVICE_ACCOUNT_KEY_FILE);
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
    documentId: DOCUMENT_ID
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
              const filename = `${IMAGE_FILENAME_PREFIX}-${imageIndex++}.jpg`;
              const file = fs.createWriteStream(`./dist/images/${filename}`);
              http.get(
                inlineObject.inlineObjectProperties.embeddedObject.imageProperties.contentUri, response => {
                  response.pipe(file);
                });
              lines.push(`\n![]({{ "${IMAGE_PATH}${filename}" | prepend: site.baseurl }})\n`);
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
      fs.writeFileSync(`./dist/${MARKDOWN_FILENAME}`, lines.join(''));
    } catch(e) {
      console.error(e);
    }
  });
});

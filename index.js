const { google } = require('googleapis');
const fs = require('fs');
const http = require('https');
const sharp = require('sharp');

const IMAGE_FILENAME_PREFIX = 'ergodash-4';
const IMAGE_PATH = '/images/2020/09/';
const DOCUMENT_ID = '1CZRHYURfGYPvbkybJKmNQLr10RcJJnchKi6J-ln7Xgo';
const SERVICE_ACCOUNT_KEY_FILE = './docs2md-481f15365566.json';
const MARKDOWN_FILENAME = '2020-09-01-ergodash_4.md';

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
              const filename = `${IMAGE_FILENAME_PREFIX}-${imageIndex++}`;
              const file = fs.createWriteStream(`./dist/images/${filename}`);
              http.get(
                inlineObject.inlineObjectProperties.embeddedObject.imageProperties.contentUri, response => {
                  response.on('end', () => {
                    const image = sharp(`./dist/images/${filename}`);
                    image.metadata().then(metadata => {
                      const width = metadata.width;
                      const height = metadata.height;
                      const format = metadata.format;
                      if (width > 800 || height > 800) {
                        if (width > height) {
                          image
                            .resize(800)
                            .toFile(`./dist/images/${filename}.${format}`, (err, info) => {
                              if (err) {
                                console.log(err);
                              }
                            });
                        } else {
                          image
                            .resize(null, 800)
                            .toFile(`./dist/images/${filename}.${format}`, (err, info) => {
                              if (err) {
                                console.log(err);
                              }
                            });
                        }
                      }
                    }).catch(reason => {
                      console.log(`${filename} ${reason}`);
                    });
                  });
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
      } else if (items.table) {
        const code = [];
        items.table.tableRows[0].tableCells[0].content
          .forEach(c => {
            c.paragraph.elements.forEach(e => {
              code.push(e.textRun.content);
            });
          });
        lines.push('```\n' + code.join('') + '```\n\n');
      }
    });
    try {
      fs.writeFileSync(`./dist/${MARKDOWN_FILENAME}`, lines.join(''));
    } catch(e) {
      console.error(e);
    }
  });
});

const authorize = () => {
  return new Promise((resolve, reject) => {
    const JWT = google.auth.JWT;
    const keys = require(SERVICE_ACCOUNT_KEY_FILE);
    const jwtClient = new JWT(
      keys.client_email,
      null,
      keys.private_key,
      ['https://www.googleapis.com/auth/documents.readonly']
    );
    jwtClient.authorize((err, tokens) => {
      err ? reject(err) : resolve(jwtClient);
    });
  });
};

const getDocument = jwtClient => {
  return new Promise((resolve, reject) => {
    const docs = google.docs({
      version: 'v1',
      auth: jwtClient
    });
    docs.documents.get({
      documentId: DOCUMENT_ID
    }, (err, res) => {
      err ? reject(err) : resolve(res);
    });
  });
}

const fetchImage = (inlineObject, filename, filepath) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    http.get(
      inlineObject.inlineObjectProperties.embeddedObject.imageProperties.contentUri, response => {
        response.on('end', () => {
          resolve();
        });
        response.on('error', (error) => {
          reject(error);
        });
        response.pipe(file);
      });
  });
};

const resizeImage = (tempFilename, filepath) => {
  return new Promise((resolve, reject) => {
    const image = sharp(filepath);
    image.metadata().then(metadata => {
      const width = metadata.width;
      const height = metadata.height;
      const format = metadata.format;
      const filename = `${tempFilename}.${format}`;
      if (width > 800 || height > 800) {
        if (width > height) {
          image
            .resize(800)
            .toFile(`${filepath}.${format}`, (err, info) => {
              fs.unlinkSync(filepath);
              err ? reject(err) : resolve(filename);
            });
        } else {
          image
            .resize(null, 800)
            .toFile(`${filepath}.${format}`, (err, info) => {
              fs.unlinkSync(filepath);
              err ? reject(err) : resolve(filename);
            });
        }
      } else {
        fs.renameSync(filepath, `${filepath}.${format}`);
        fs.unlinkSync(filepath);
        resolve(filename);
      }
    }).catch(reason => {
      reject(reason);
    });
  });
};

const inlineImage = async (document, element, imageIndex) => {
  const inlineObject = document.data.inlineObjects[element.inlineObjectElement.inlineObjectId];
  try {
    fs.mkdirSync('./dist/images');
  } catch(_e) {
  }
  const tempFilename = `${IMAGE_FILENAME_PREFIX}-${imageIndex}`;
  const filepath = `./dist/images/${tempFilename}`;
  await fetchImage(inlineObject, tempFilename, filepath);
  const filename = await resizeImage(tempFilename, filepath);
  return `\n![]({{ "${IMAGE_PATH}${filename}" | prepend: site.baseurl }})\n`;
}

const main = async () => {
  const jwtClient = await authorize();
  const document = await getDocument(jwtClient);
  try {
    fs.mkdirSync('./dist');
  } catch(_e) {
  }
  const lines = [];
  let imageIndex = 1;
  for (let items of document.data.body.content) {
    if (items.paragraph) {
      if (items.paragraph.paragraphStyle.namedStyleType === 'NORMAL_TEXT') {
        for (let element of items.paragraph.elements) {
          if (element.textRun) {
            lines.push(element.textRun.content);
          } else if (element.inlineObjectElement) {
            lines.push(await inlineImage(document, element, imageIndex++));
          }
        }
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
    } else if (items.table) {
      const code = [];
      items.table.tableRows[0].tableCells[0].content
        .forEach(c => {
          c.paragraph.elements.forEach(e => {
            code.push(e.textRun.content);
          });
        });
      lines.push('\n```\n' + code.join('') + '```\n');
    }
  }
  fs.writeFileSync(`./dist/${MARKDOWN_FILENAME}`, lines.join(''));
}

main()
  .then(() => {
    console.log('Finish.');
  })
  .catch(reason => {
    console.log(reason);
  });
const { google } = require('googleapis');
const fs = require('fs');
const http = require('https');
const sharp = require('sharp');

const IMAGE_FILENAME_PREFIX = 'ergodash-7';
const IMAGE_PATH = '/images/2020/09/';
const DOCUMENT_ID = '1ARsJGjGfaVThd3raCVLm8RC_tvS0DYs-LMJrTcMWras';
const SERVICE_ACCOUNT_KEY_FILE = './docs2md-481f15365566.json';
const MARKDOWN_FILENAME = '2020-09-03-ergodash_7.md';

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
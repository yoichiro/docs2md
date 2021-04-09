const { google } = require('googleapis');
const fs = require('fs');
const http = require('https');
const sharp = require('sharp');
const prompts = require('prompts');
const moment = require('moment');

const SERVICE_ACCOUNT_KEY_FILE = './docs2md-481f15365566.json';

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

const getDocument = (jwtClient, documentId) => {
  return new Promise((resolve, reject) => {
    const docs = google.docs({
      version: 'v1',
      auth: jwtClient
    });
    docs.documents.get({
      documentId: documentId
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
      const filename = `${tempFilename}.webp`;
      if (width > 800 || height > 800) {
        if (width > height) {
          image
            .resize(800)
            .webp({
              quality: 75
            })
            .toFile(`${filepath}.webp`, (err, info) => {
              fs.unlinkSync(filepath);
              err ? reject(err) : resolve(filename);
            });
        } else {
          image
            .resize(null, 800)
            .webp({
              quality: 75
            })
            .toFile(`${filepath}.webp`, (err, info) => {
              fs.unlinkSync(filepath);
              err ? reject(err) : resolve(filename);
            });
        }
      } else {
        image
          .webp({
            quality: 75
          })
          .toFile(`${filepath}.webp`, (err, info) => {
            fs.unlinkSync(filepath);
            err ? reject(err) : resolve(filename);
          });
      }
    }).catch(reason => {
      reject(reason);
    });
  });
};

const inlineImage = async (document, element, imageIndex, imageFilenamePrefix, imagePath) => {
  const inlineObject = document.data.inlineObjects[element.inlineObjectElement.inlineObjectId];
  try {
    fs.mkdirSync('./dist/images');
  } catch(_e) {
  }
  const tempFilename = `${imageFilenamePrefix}-${imageIndex}`;
  const filepath = `./dist/images/${tempFilename}`;
  await fetchImage(inlineObject, tempFilename, filepath);
  const filename = await resizeImage(tempFilename, filepath);
  return `\n![]({{ "${imagePath}${filename}" | prepend: site.baseurl }})\n`;
}

const getDataFromPrompt = async (name, desc, initial) => {
  const option = {
    type: 'text',
    name,
    message: desc
  };
  if (initial) {
    option.initial = initial;
  }
  const response = await prompts(option);
  return response[name];
}

const loadPreviousData = async () => {
  if (fs.existsSync('./.docs2md')) {
    const json = fs.readFileSync('./.docs2md');
    return JSON.parse(json);
  } else {
    return {};
  }
};

const savePreviousData = async data => {
  fs.writeFileSync('./.docs2md', JSON.stringify(data));
};

const main = async () => {
  const previousData = await loadPreviousData();
  const documentId = await getDataFromPrompt('documentId', 'Document ID', previousData.documentId);
  if (!documentId) {
    return;
  }
  previousData.documentId = documentId;
  savePreviousData(previousData);
  const now = moment();
  const current = now.format('YYYY/MM');
  const imagePath = await getDataFromPrompt('imagePath', 'Image path', `/images/${current}/`);
  if (!imagePath) {
    return;
  }
  const imageFilenamePrefix = await getDataFromPrompt('imageFilenamePrefix', 'Image Filename Prefix', previousData.imageFilenamePrefix);
  if (!imageFilenamePrefix) {
    return;
  }
  previousData.imageFilenamePrefix = imageFilenamePrefix;
  savePreviousData(previousData);
  const markdownFilename = await getDataFromPrompt('markdownFilename', 'Markdown filename', previousData.markdownFilename);
  if (!markdownFilename) {
    return;
  }
  previousData.markdownFilename = markdownFilename;
  savePreviousData(previousData);

  const jwtClient = await authorize();
  const document = await getDocument(jwtClient, documentId);
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
            lines.push(await inlineImage(document, element, imageIndex++, imageFilenamePrefix, imagePath));
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
      } else if (items.paragraph.paragraphStyle.namedStyleType === 'HEADING_2') {
        const heads = items.paragraph.elements.map(element => {
          if (element.textRun) {
            return element.textRun.content;
          } else {
            return null;
          }
        }).filter(x => x !== null);
        lines.push(`## ${heads.join('')}\n`);
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
  fs.writeFileSync(`./dist/${markdownFilename}`, lines.join(''));
}

main()
  .then(() => {
    console.log('Finish.');
  })
  .catch(reason => {
    console.log(reason);
  });
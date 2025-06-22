// Unified Anki CSV Importer for Serial Course, Pronunciation, and Vocab
// Requirements: Node.js, Anki running with AnkiConnect installed

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');

const ANKI_CONNECT_URL = 'http://localhost:8765';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ankiInvoke(action, params = {}) {
  const { data } = await axios.post(ANKI_CONNECT_URL, {
    action,
    version: 6,
    params
  });
  if (data.error) throw new Error(data.error);
  return data.result;
}

const DECK_LEVELS = [
  { range: [1, 20], name: '1 - Absolute Beginner' },
  { range: [21, 40], name: '2 - Early Beginner' },
  { range: [41, 60], name: '3 - Mid-Level Beginner' },
  { range: [61, 80], name: '4 - Upper Beginner' },
  { range: [81, 100], name: '5 - Advanced Beginner' },
  { range: [101, 120], name: '6 - Basic Intermediate' },
  { range: [121, 140], name: '7 - Lower Intermediate' },
  { range: [141, 160], name: '8 - Intermediate' }
];

const EXTRA_MAP = [
  [1, 2], [3, 4], [5, 6], [7, 8],
  [9, 10], [11, 12], [13, 14], [15, 16]
];

function getSerialCourseDeckName(fileName) {
  const baseName = path.basename(fileName, '.csv');
  const lower = fileName.toLowerCase();

  if (lower.startsWith('extra stories')) return 'Extra Stories';

  const lessonMatch = fileName.match(/lesson (\d+)/i);
  if (lessonMatch) {
    const lessonNum = +lessonMatch[1];
    const level = DECK_LEVELS.find(l => lessonNum >= l.range[0] && lessonNum <= l.range[1]);
    return level ? `${level.name}::${baseName}` : `Other::${baseName}`;
  }

  const extraMatch = fileName.match(/extra sentences (\d+)/i);
  if (extraMatch) {
    const extraNum = +extraMatch[1];
    const idx = EXTRA_MAP.findIndex(arr => arr.includes(extraNum));
    const level = DECK_LEVELS[idx];
    return level ? `${level.name}::${baseName}` : `Other::${baseName}`;
  }

  return `Other::${baseName}`;
}

async function importAnkiDeck(config) {
  const fullDirPath = path.join(__dirname, config.dir);
  if (!fs.existsSync(fullDirPath)) return;

  const files = fs.readdirSync(fullDirPath).filter(config.fileFilter);
  for (const file of files) {
    const deckName = `${config.deckPrefix}${config.mapDeckName(file)}`;
    const csvPath = path.join(fullDirPath, file);
    const content = fs.readFileSync(csvPath, 'utf8');
    const records = parse(content, { skip_empty_lines: true });

    const notes = records.map(row => ({
      deckName,
      modelName: config.noteType,
      fields: config.parseFields(row),
      options: { allowDuplicate: false }
    }));

    try {
      await ankiInvoke('createDeck', { deck: deckName });
      await sleep(1);
      await ankiInvoke('addNotes', { notes });
      console.log(`Imported ${file} into deck: ${deckName}`);
    } catch (e) {
      console.error(`Failed to import ${file} into ${deckName}:`, e);
    }
    await sleep(1);
  }
}

const IMPORT_CONFIGS = [
  {
    name: 'Serial Course',
    dir: 'dist/serial-course',
    deckPrefix: 'IC::Serial Course::',
    noteType: 'IC Serial Course',
    fileFilter: f => f.endsWith('.csv'),
    mapDeckName: getSerialCourseDeckName,
    parseFields: ([id, simplified, traditional, pinyin, english, notes, audio, audioslow]) => ({
      ID: id,
      Simplified: simplified,
      Traditional: traditional,
      Pinyin: pinyin,
      English: english,
      Notes: notes,
      Audio: audio,
      'Audio Slow': audioslow
    })
  },
  {
    name: 'Pronunciation',
    dir: 'dist/pronounciation',
    deckPrefix: 'IC::Pronounciation::',
    noteType: 'IC Pronounciation',
    fileFilter: f => f.endsWith('.csv'),
    mapDeckName: file => `${file}`,
    parseFields: ([id, pinyin, description, audio]) => ({
      ID: id,
      Pinyin: pinyin,
      Description: description,
      Audio: audio
    })
  }
];

async function main() {
  for (const config of IMPORT_CONFIGS) {
    await importAnkiDeck(config);
  }
  console.log('All imports complete.');
}

main().catch(console.error);
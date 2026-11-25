import fs from 'node:fs';
const files = [
  '2024/03/a-person-holding-a-koran-book-8164574-683x1024.jpg',
  '2024/03/quran-pdf.png',
  '2024/03/open-quran-book-with-islamic-text-3272118-1024x683-1.jpg',
  '2024/03/high-angle-of-opened-koran-book-placed.jpeg',
  '2024/03/man-hands-holding-smartphone-digital-quran-1024x683.jpeg',
  '2024/03/koran-on-metal-stand-15807108-683x1024.jpg',
  '2024/03/Free-Close-Up-Photography-of-a-Quran-Stock-Photo.jpg',
  '2024/03/Free-Pages-of-a-Holy-Book-Stock-Photo.jpg',
  '2024/03/Children-reading-the-Quran-1024x683.jpg',
];
for (const f of files) console.log(fs.existsSync('public/wp-content/uploads/' + f), f);

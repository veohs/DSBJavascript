const axios = require('axios');
const { JSDOM } = require('jsdom');
const { TesseractWorker } = require('tesseract.js');
const { v4: uuidv4 } = require('uuid');


class DSBApi {
    constructor(username, password, tablemapper=['class','lesson','subject','room','new_subject','new_teacher','teacher']) {
        this.DATA_URL = "https://app.dsbcontrol.de/JsonHandler.ashx/GetData";
        this.username = username;
        this.password = password;
        if (!Array.isArray(tablemapper)) {
            throw new TypeError('Attribute tablemapper is not of type array!');
        }
        this.tablemapper = tablemapper;
        this.class_index = this.tablemapper.indexOf('class');
    }

    async fetch_entries(images = true) {
        const current_time = new Date().toISOString().slice(0, -5) + "Z";

        const params = {
            "UserId": this.username,
            "UserPw": this.password,
            "AppVersion": "2.5.9",
            "Language": "de",
            "OsVersion": "28 8.0",
            "AppId": uuidv4(),
            "Device": "SM-G930F",
            "BundleId": "de.heinekingmedia.dsbmobile",
            "Date": current_time,
            "LastUpdate": current_time
        };

        const paramsJSON = JSON.stringify(params);
        const paramsCompressed = Buffer.from(paramsJSON, 'utf-8').toString('base64');

        try {
            const timetableData = await axios.post(this.DATA_URL, {
                req: { Data: paramsCompressed, DataType: 1 }
            });

            const dataCompressed = timetableData.data.d;
            const dataBuffer = Buffer.from(dataCompressed, 'base64');
            const dataJSON = zlib.unzipSync(dataBuffer).toString('utf-8');
            const data = JSON.parse(dataJSON);

            if (data.Resultcode !== 0) {
                throw new Error(data.ResultStatusInfo);
            }

            const final = [];
            for (const page of data.ResultMenuItems[0].Childs) {
                for (const child of page.Root.Childs) {
                    if (Array.isArray(child.Childs)) {
                        for (const subChild of child.Childs) {
                            final.push(subChild.Detail);
                        }
                    } else {
                        final.push(child.Childs.Detail);
                    }
                }
            }

            if (!final.length) {
                throw new Error("Timetable data could not be found");
            }

            const output = [];
            for (const entry of final) {
                if (entry.endsWith(".htm") && !entry.endsWith(".html") && !entry.endsWith("news.htm")) {
                    output.push(await this.fetch_timetable(entry));
                } else if (entry.endsWith(".jpg") && images === true) {
                    output.push(await this.fetch_img(entry));
                }
            }

            return output.length === 1 ? output[0] : output;
        } catch (error) {
            throw new Error(`Error fetching entries: ${error.message}`);
        }
    }

    async fetch_img(imgurl) {
        try {
            const imgResponse = await axios.get(imgurl, { responseType: 'arraybuffer' });
            
            // Check if the response contains valid image data
            if (imgResponse.headers['content-type'].startsWith('image')) {
                const buffer = Buffer.from(imgResponse.data, 'binary');
                const worker = new TesseractWorker();
                const { text } = await worker.recognize(buffer);
                worker.terminate();
                return text;
            } else {
                throw new Error('Invalid image response');
            }
        } catch (error) {
            throw new Error(`Error fetching image: ${error.message}`);
        }
    }
    

    async fetch_timetable(timetableurl) {
        try {
            const sauce = await axios.get(timetableurl);
            const dom = new JSDOM(sauce.data);
            const soupi = dom.window.document;

            let ind = -1;
            const results = [];

            for (const table of soupi.querySelectorAll('table.mon_list')) {
                ind++;
                const updates = soupi.querySelectorAll('table.mon_head')[ind].querySelector('p span:last-child').nextSibling.nodeValue.split("Stand: ")[1];
                const titles = soupi.querySelectorAll('div.mon_title')[ind].textContent;
                const date = titles.split(" ")[0];
                const day = titles.split(" ")[1].split(", ")[0].replace(",", "");
                const entries = table.querySelectorAll('tr');
                entries.shift();
                for (const entry of entries) {
                    const infos = entry.querySelectorAll('td');
                    if (infos.length < 2) continue;

                    const class_array = this.class_index !== -1 ? infos[this.class_index].textContent.split(", ") : ['---'];
                    for (const class_ of class_array) {
                        const new_entry = {
                            date: date,
                            day: day,
                            updated: updates
                        };
                        infos.forEach((info, i) => {
                            const attribute = i < this.tablemapper.length ? this.tablemapper[i] : `col${i}`;
                            if (attribute === 'class') {
                                new_entry[attribute] = info.textContent !== "\xa0" ? class_ : "---";
                            } else {
                                new_entry[attribute] = info.textContent !== "\xa0" ? info.textContent : "---";
                            }
                        });
                        results.push(new_entry);
                    }
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Error fetching timetable: ${error.message}`);
        }
    }
}


const entries = await dsbclient.fetch_entries();
console.log(entries); // Ausgabe der Daten zur Überprüfung



async function fetch_entries_by_day(dsbclient, klasse, wanted_day) {
    const days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
    if (!days.includes(wanted_day.charAt(0).toUpperCase() + wanted_day.slice(1))) {
        return "Ungültiger Tag. Bitte geben Sie einen gültigen Tag ein.";
    }

    try {
        const entries = await dsbclient.fetch_entries();

        // Check if entries is null or undefined
        if (!entries) {
            throw new Error("Error fetching entries: Entries are null or undefined");
        }

        const final = [];

        for (const entry of entries) {
            for (const item of entry) {
                if (item.class === klasse && item.day === wanted_day.charAt(0).toUpperCase() + wanted_day.slice(1)) {
                    final.push({
                        lesson: item.lesson,
                        new_subject: item.new_subject,
                        room: item.room,
                        old_subject: item.subject,
                        teacher: item.new_teacher,
                        type: item.type,
                        text: item.text
                    });
                }
            }
        }

        let message = `Am ${wanted_day.charAt(0).toUpperCase() + wanted_day.slice(1)} gibt es ${final.length} Einträge. `;
        final.forEach(s => {
            message += `In der ${s.lesson}. Stunde hast du ${s.teacher} bei ${s.room} in ${s.old_subject}. Grund dafür ist ${s.text}. `;
        });
        return message;
    } catch (error) {
        throw new Error(`Error fetching entries by day: ${error.message}`);
    }
}


const klasse = "10a";
const dsbclient = new DSBApi("299761", "cicero2223", ['class', 'lesson', 'new_subject', 'room', 'subject', 'new_teacher', 'type', 'text']);

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

readline.question("Geben Sie den gewünschten Tag ein (z.B. Montag): ", async (wanted_day) => {
    const result = await fetch_entries_by_day(dsbclient, klasse, wanted_day);
    console.log(result);
    readline.close();
});

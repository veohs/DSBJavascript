const axios = require('axios');
const { JSDOM } = require('jsdom');
const { createCanvas, loadImage } = require('canvas');
const Tesseract = require('tesseract.js');
const pako = require('pako');

class DSBApi {
    constructor(username, password, tablemapper=['type','class','lesson','subject','room','new_subject','new_teacher','teacher']) {
        this.DATA_URL = "https://app.dsbcontrol.de/JsonHandler.ashx/GetData";
        this.username = username;
        this.password = password;
        if (!Array.isArray(tablemapper)) {
            throw new TypeError('Attribute tablemapper is not of type array!');
        }
        this.tablemapper = tablemapper;

        // loop over tablemapper array and identify the keyword "class". The "class" will have a special operation in split up the datasets
        this.class_index = null;
        for (let i = 0; i < this.tablemapper.length; i++) {
            if (this.tablemapper[i] === 'class') {
                this.class_index = i;
                break;
            }
        }
    }

    async fetch_entries(images=true) {
        const current_time = new Date().toISOString();

        // Parameters required for the server to accept our data request
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
        
        try {
            // Send the request
            const json_data = {
                req: {
                    Data: Buffer.from(JSON.stringify(params)).toString('base64'),
                    DataType: 1
                }
            };
            const { data: timetable_data } = await axios.post(this.DATA_URL, json_data);

            // Decompress response
            const data_compressed = timetable_data.d;
            const data = JSON.parse(pako.inflate(Uint8Array.from(data_compressed, c => c.charCodeAt(0)), { to: 'string' }));

            // validate response before proceeding
            if (data.Resultcode !== 0) {
                throw new Error(data.ResultStatusInfo);
            }

            const final = [];
            for (const page of data.ResultMenuItems[0].Childs) {
                for (const child of page.Root.Childs) {
                    if (Array.isArray(child.Childs)) {
                        for (const sub_child of child.Childs) {
                            final.push(sub_child.Detail);
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

            const filteredOutput = output.filter(entry => entry !== null);
            return filteredOutput.length === 1 ? filteredOutput[0] : filteredOutput;
        } catch (error) {
            throw new Error(error.message || "An error occurred while fetching entries");
        }
    }

    async fetch_img(imgurl) {
        try {
            const response = await axios.get(imgurl, { responseType: 'arraybuffer' });
            const image = await loadImage(response.data);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const { data: { text } } = await Tesseract.recognize(canvas.toDataURL());
            return text;
        } catch (error) {
            console.error("An error occurred while fetching image:", error.message);
            return null;
        }
    }

    async fetch_timetable(timetableurl) {
        try {
            const { data: sauce } = await axios.get(timetableurl);
            const dom = new JSDOM(sauce);
            const soupi = dom.window.document;
            let ind = -1;
            const results = [];
            soupi.querySelectorAll('table.mon_list').forEach((soup) => {
                ind += 1;
                const updates = soupi.querySelectorAll('table.mon_head .mon_title span')[ind].textContent.split("Stand: ")[1];
                const titles = soupi.querySelectorAll('.mon_title')[ind].textContent;
                const date = titles.split(" ")[0];
                const day = titles.split(" ")[1].split(", ")[0].replace(",", "");
                const entries = soup.querySelectorAll("tr");
                entries.shift();
                entries.forEach((entry) => {
                    const infos = entry.querySelectorAll("td");
                    if (infos.length < 2) return;
                    let class_array = ['---'];
                    if (this.class_index !== null) {
                        class_array = infos[this.class_index].textContent.split(", ");
                    }
                    class_array.forEach((class_) => {
                        const new_entry = {
                            date: date,
                            day: day,
                            updated: updates
                        };
                        infos.forEach((info, i) => {
                            const attribute = (i < this.tablemapper.length) ? this.tablemapper[i] : `col${i}`;
                            new_entry[attribute] = (attribute === 'class' && info.textContent === "\xa0") ? "---" : info.textContent;
                        });
                        results.push(new_entry);
                    });
                });
            });
            return results;
        } catch (error) {
            console.error("An error occurred while fetching timetable:", error.message);
            return null;
        }
    }
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

module.exports = DSBApi;

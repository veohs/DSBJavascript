const { DSBApi } = require('./dsbapi');

async function fetchEntriesByDay(dsbClient, klasse, wantedDay) {
    const days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
    if (!days.includes(capitalizeFirstLetter(wantedDay))) {
        return "Ungültiger Tag. Bitte geben Sie einen gültigen Tag ein.";
    }

    try {
        const entries = await dsbClient.fetch_entries();
        if (!entries || !Array.isArray(entries)) {
            throw new Error("Fehlerhafte Antwort erhalten. Die Einträge sind nicht vorhanden oder nicht in einem Array.");
        }

        const final = [];

        for (const entry of entries) {
            if (!Array.isArray(entry)) continue; // Skip non-array entries
            for (const item of entry) {
                if (item && item.class === klasse && item.day === capitalizeFirstLetter(wantedDay)) {
                    const { lesson, new_subject: subject, room, subject: oldsubject, new_teacher: teacher, type: vertreter, text } = item;
                    final.push({ lesson, subject, room, oldsubject, teacher, vertreter, text });
                }
            }
        }

        if (final.length === 0) {
            return `Am ${capitalizeFirstLetter(wantedDay)} gibt es keine Einträge für die Klasse ${klasse}.`;
        }

        let message = `Am ${capitalizeFirstLetter(wantedDay)} gibt es ${final.length} Einträge für die Klasse ${klasse}. `;
        for (const s of final) {
            message += `In der ${s.lesson}. Stunde hast du ${s.teacher} mit ${s.room} in ${s.oldsubject}. Grund dafür ist ${s.text}. `;
        }
        return message;
    } catch (error) {
        console.error("An error occurred while fetching entries by day:", error.message);
        return "Fehler beim Abrufen der Einträge.";
    }
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const klasse = "10a";
const dsbclient = new DSBApi("299761", "cicero2223", ['class','lesson','new_subject','room','subject','new_teacher','type','text']);

const wantedDay = "Montag";
fetchEntriesByDay(dsbclient, klasse, wantedDay)
    .then(result => console.log(result))
    .catch(error => console.error("An error occurred:", error.message));

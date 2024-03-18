const DSBApi = require('./dsbapi');

async function fetchEntriesByDay(dsbClient, klasse, wantedDay) {
    const days = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag"];
    if (!days.includes(wantedDay.capitalize())) {
        return "Ungültiger Tag. Bitte geben Sie einen gültigen Tag ein.";
    }
    
    try {
        const entries = await dsbClient.fetch_entries();
        const final = [];

        entries.forEach((entry) => {
            entry.forEach((item) => {
                if (item.class === klasse && item.day === wantedDay.capitalize()) {
                    const { lesson, new_subject: subject, room, subject: oldsubject, new_teacher: teacher, type: vertreter, text } = item;
                    final.push({ lesson, subject, room, oldsubject, teacher, vertreter, text });
                }
            });
        });

        let message = `Am ${wantedDay.capitalize()} gibt es ${final.length} Einträge. `;
        final.forEach((entry) => {
            message += `In der ${entry.lesson}. Stunde hast du ${entry.teacher} mit ${entry.room} in ${entry.oldsubject}. Grund dafür ist ${entry.text}. `;
        });

        return message;
    } catch (error) {
        console.error("An error occurred while fetching entries by day:", error.message);
        return "Fehler beim Abrufen der Einträge.";
    }
}

const klasse = "10a";
const dsbClient = new DSBApi("299761", "cicero2223", ['class','lesson','new_subject','room','subject','new_teacher','type','text']);

const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

readline.question("Geben Sie den gewünschten Tag ein (z.B. Montag): ", async (wantedDay) => {
    const result = await fetchEntriesByDay(dsbClient, klasse, wantedDay);
    console.log(result);
    readline.close();
});

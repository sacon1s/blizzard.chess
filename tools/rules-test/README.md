Проверка правил базы (`database.rules.json`) на симуляторе targaryen: обычные действия сайта должны проходить,
подделки — нет.

    cd tools/rules-test && npm i --no-save targaryen@3.1.0 && node test.js ../../database.rules.json

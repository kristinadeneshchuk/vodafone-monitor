import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/Users/kristinadeneshchuk/Workspace/vodafone-monitor";
const skillDir = "/Users/kristinadeneshchuk/.codex/plugins/cache/openai-primary-runtime/presentations/26.915.20218/skills/presentations";
const buildDir = path.join(workspaceDir, ".pptx-build");
const stagingDir = path.join(workspaceDir, ".codex-finalizer");
const candidatePath = path.join(stagingDir, "vodafone-reputation-pitch-candidate.pptx");
const finalPath = path.join(workspaceDir, "output", "vodafone-reputation-business-pitch-final-v11.pptx");
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(
  path.join(skillDir, "container_tools", "artifact_tool_utils.mjs"),
).href);

const font = resolvePresentationFont({ preferredFamilies: ["Arial", "Aptos", "Calibri"] });
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const C = { red: "#E60000", redDark: "#A60D13", ink: "#1D2A3A", muted: "#63748B", pale: "#F4F7FB", line: "#DCE4EE", white: "#FFFFFF", green: "#1C8B62" };

function box(slide, x, y, w, h, fill = "none", line = "none", radius = 0) {
  return slide.shapes.add({ geometry: radius ? "roundRect" : "rect", position: { left: x, top: y, width: w, height: h }, fill, line: { fill: line, width: line === "none" ? 0 : 1 }, ...(radius ? { borderRadius: radius } : {}) });
}
function text(slide, value, x, y, w, h, size = 20, color = C.ink, bold = false, align = "left") {
  const s = slide.shapes.add({ geometry: "textbox", position: { left: x, top: y, width: w, height: h }, fill: "none", line: { fill: "none", width: 0 } });
  s.text = value;
  s.text.style = { typeface: font, fontSize: size, color, bold, autoFit: "shrink", alignment: align, verticalAlignment: "middle", marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0 };
  return s;
}
function header(slide, kicker, title, n) {
  text(slide, kicker.toUpperCase(), 72, 38, 820, 22, 14, C.red, true);
  text(slide, title, 72, 67, 980, 68, 34, C.ink, true);
  box(slide, 72, 145, 58, 4, C.red);
  text(slide, String(n).padStart(2, "0"), 1150, 42, 58, 28, 15, C.muted, true, "right");
}
function foot(slide, source) {
  text(slide, source, 72, 682, 1070, 18, 11, C.muted, false);
  text(slide, "ReputationX · Vodafone UA", 955, 682, 253, 18, 11, C.muted, false, "right");
}
async function image(slide, filename, x, y, w, h, crop) {
  const blob = await fs.readFile(path.join(buildDir, "assets", filename));
  slide.images.add({ blob, contentType: "image/png", alt: "Скріншот робочого дашборду ReputationX", position: { left: x, top: y, width: w, height: h }, fit: "cover", crop, geometry: "roundRect", borderRadius: 18 });
}
function note(slide, content) { slide.speakerNotes.textFrame.setText(content); }

// 1 — cover
{
  const s = p.slides.add(); s.background.fill = C.red;
  text(s, "VODAFONE: AI REPUTATION & CRISIS INTELLIGENCE", 82, 78, 950, 32, 18, C.white, true);
  text(s, "Бізнес-кейс раннього\nвиявлення репутаційних ризиків", 82, 170, 920, 145, 49, C.white, true);
  text(s, "Робочий MVP на відкритих даних України", 84, 355, 610, 36, 24, C.white, false);
  box(s, 82, 452, 1120, 1, "#FFFFFF");
  text(s, "20 627 відкритих згадок за рік", 82, 490, 430, 30, 20, C.white, true);
  text(s, "Репутаційний сигнал, придатний для перевірки та дії", 82, 545, 780, 35, 25, C.white, false);
  text(s, "Vodafone UA · вересень 2026", 82, 652, 500, 22, 15, C.white, false);
  note(s, "У презентації джерела підписані звичайним текстом. Сценарні розрахунки прямо названі сценаріями.");
}

// 2 — context: what the system does
{
  const s = p.slides.add(); s.background.fill = C.white;
  header(s, "Що робить система", "Вона знаходить важливі згадки й допомагає команді вирішити, що перевірити", 2);
  box(s, 72, 190, 508, 328, C.pale, "none", 18);
  text(s, "Реальний відгук Vodafone", 102, 218, 440, 28, 17, C.red, true);
  text(s, "«...вирішіть мою проблему а ні\nя перейду на лайф сел»", 102, 270, 438, 90, 26, C.ink, true);
  text(s, "Google Play · 06.05.2026\nДані автора не збираємо", 102, 440, 430, 48, 16, C.muted, false);
  text(s, "Як працює MVP", 635, 194, 420, 34, 24, C.ink, true);
  const steps = [
    ["1", "Збирає відкриті згадки"],
    ["2", "Визначає тему й можливу причину"],
    ["3", "Показує сигнал і посилання на джерело"],
    ["4", "Команда перевіряє та вирішує, що робити"],
  ];
  let sy = 250;
  for (const [n, label] of steps) {
    box(s, 635, sy, 48, 48, n === "4" ? C.red : "#E7EDF5", "none", 24);
    text(s, n, 635, sy + 2, 48, 42, 20, n === "4" ? C.white : C.ink, true, "center");
    text(s, label, 706, sy + 1, 440, 46, 20, C.ink, n === "4");
    sy += 68;
  }
  text(s, "154 грн/міс × 12 = 1 848 грн середньої річної виручки на абонента", 72, 526, 1080, 32, 22, C.red, true);
  text(s, "Це бізнес-орієнтир, а не доведена втрата саме цього автора. Відгук — сигнал, не доказ відтоку.", 72, 568, 1080, 32, 16, C.ink, true);
  foot(s, "Відкритий відгук у вибірці MVP · Google Play · 06.05.2026");
  note(s, "Джерело цитати: src/lib/data/real-data.json, запис 2772, Vodafone, Google Play review, 06.05.2026. Наведений фрагмент дослівний; персональні дані автора не збираються. ARPU 154 грн/міс — публічний показник Vodafone: https://www.vodafone.ua/news/business-invest/vodafone-invests. 1 848 грн — лише річна середня виручка на абонента, не оцінка ймовірності відтоку й не доведена втрата саме цього клієнта.");
}

// 3 — focused scope and data funnel
{
  const s = p.slides.add(); s.background.fill = C.white; header(s, "Чому ми звузили фокус", "251 із 1 130 скарг стосується зв’язку", 3);
  const rows = [["20 627", "відкритих згадок"], ["9 610", "згадок про Vodafone"], ["1 130", "скарг Vodafone за всіма темами"], ["251", "скарга про зв’язок"]];
  let y = 183;
  for (let i = 0; i < rows.length; i++) {
    const active = i === 3; box(s, 92, y, 684 - i * 54, 60, active ? "#FFF2F2" : C.pale, active ? "#F1B6B6" : "none", 10);
    text(s, rows[i][0], 116, y + 11, 156, 37, 28, active ? C.red : C.ink, true);
    text(s, rows[i][1], 296, y + 13, 420, 33, 18, C.ink, false);
    y += 73;
  }
  text(s, "Чому саме зв’язок?", 852, 194, 300, 31, 23, C.red, true);
  text(s, "Ці повідомлення допомагають визначити, що перевірити: покриття, мережу чи резервне живлення.", 852, 244, 310, 112, 21, C.ink, true);
  box(s, 852, 393, 310, 119, C.pale, "none", 16);
  text(s, "Інші скарги теж є в базі", 876, 413, 260, 26, 17, C.muted, true);
  text(s, "Застосунок 241 · тарифи 164\nСписання коштів 59", 876, 450, 265, 48, 18, C.ink, false);
  text(s, "251 — кількість публічних скарг у вибірці, не кількість постраждалих абонентів.", 92, 557, 1050, 37, 19, C.ink, true);
  foot(s, "Вибірка відкритих згадок · 01.09.2025–19.09.2026");
  note(s, "Джерело цифр: src/lib/data/real-summary.json. 251 — публічні скарги про зв’язок у вибірці. Категорії застосунок, тарифи й списання коштів наведені як інші теми, які не є фокусом MVP. Це дані згадок, не унікальних клієнтів.");
}

// 4 — seasonal business signal
{
  const s = p.slides.add(); s.background.fill = C.white;
  header(s, "Сезонний сигнал", "Згадки про Vodafone частіше з’являлись узимку", 4);
  text(s, "44 із 52", 82, 198, 415, 88, 66, C.red, true);
  text(s, "85%", 82, 310, 300, 74, 55, C.ink, true);
  text(s, "записів про Vodafone у вибірці\nдатовані листопадом–лютим", 385, 308, 740, 76, 26, C.ink, true);
  box(s, 82, 429, 1080, 1, C.line);
  text(s, "Що це означає для бізнесу", 82, 462, 420, 32, 23, C.red, true);
  text(s, "Сезонний сигнал для перевірки готовності резервного живлення до зими. Сам по собі він не визначає потрібний бюджет чи місця для інвестицій.", 82, 510, 1080, 70, 21, C.ink, true);
  text(s, "52 записи: 47 відгуків і 5 новин. Це не кількість унікальних клієнтів чи підтверджених інцидентів.", 82, 606, 1080, 28, 15, C.muted, false);
  foot(s, "Вибірка Vodafone · 23.09.2025–27.05.2026");
  note(s, "Перевірка на локальній БД mentions.db за правилами blackout.py станом на 19.09.2026: негативні/змішані записи, контекст або причина blackout, тип причини з набору coverage/internet/calls/outage/blackout, виключені реклама та market-wide. Для Vodafone знайдено 52 записи, з них 44 за листопад–лютий (44/52 = 84,6%, округлено 85%). Джерела: 47 відгуків і 5 новин. Дати Vodafone-вибірки: 23.09.2025–27.05.2026. Це повідомлення у вибірці, а не унікальні абоненти або підтверджені інциденти. Висновок обмежений: сезонність виправдовує перевірку готовності; дані не доводять потребу в капітальних інвестиціях і не визначають конкретні об'єкти.");
}

// 5 — live demo timeline
{
  const s = p.slides.add(); s.background.fill = C.white; header(s, "Робочий MVP", "30-денний зріз: команда бачить динаміку, а не абстрактну тональність", 5);
  await image(s, "timeline-current.png", 72, 188, 760, 420);
  box(s, 875, 205, 305, 97, C.pale, "none", 16); text(s, "15", 900, 222, 95, 42, 42, C.red, true); text(s, "згадок\nза 30 днів", 1005, 222, 140, 50, 17, C.ink, true);
  box(s, 875, 326, 305, 97, C.pale, "none", 16); text(s, "7", 900, 343, 95, 42, 42, C.red, true); text(s, "скарг\nу цьому зрізі", 1005, 343, 140, 50, 17, C.ink, true);
  text(s, "Що може перевірити команда", 875, 475, 305, 32, 20, C.red, true);
  text(s, "Коли зросла кількість згадок\nЯкі скарги стоять за зміною\nЧи потрібна реакція команди", 875, 518, 305, 86, 18, C.ink, false);
  foot(s, "Зріз за 21.08–19.09.2026 · 15 згадок · 7 скарг");
  note(s, "Показати live: Аналіз періодів, 30-денний зріз, кнопка «Відкрити у фіді». Не називати 15 згадок скаргами.");
}

// 6 — evidence source
{
  const s = p.slides.add(); s.background.fill = C.white; header(s, "Перевірка повідомлень", "Команда бачить, про що скаржаться і звідки взято повідомлення", 6);
  await image(s, "feed-current.png", 72, 205, 760, 369);
  text(s, "У повідомленні видно", 870, 204, 310, 30, 21, C.red, true);
  text(s, "Тему скарги\nЧи стосується Vodafone\nПріоритет перевірки\nПосилання на оригінал", 870, 258, 310, 180, 20, C.ink, true);
  foot(s, "Приклад стрічки повідомлень · 19.09.2026");
  note(s, "Показати один запис і перехід до оригіналу. Це ключовий доказ роботи на відкритих реальних матеріалах. Не показувати персональні дані авторів.");
}

// 7 — architecture + response mechanics
{
  const s = p.slides.add(); s.background.fill = C.white; header(s, "Система і дія", "Один запис проходить спільний конвеєр і дає різні дії командам", 7);
  const stages = [
    ["Джерела", "Google Play\nApp Store\nGoogle News\n38 Telegram-каналів"],
    ["AI-аналіз", "тональність\nпричина\nлокація\nризик"],
    ["Сховище", "SQLite\nдедуплікація\nісторія сигналів"],
    ["Дашборд", "період\nстрічка\nпершоджерело\nалерт"],
  ];
  let x = 72;
  for (let i = 0; i < stages.length; i++) {
    box(s, x, 192, 245, 176, i === 1 ? "#FFF2F2" : C.pale, i === 1 ? "#F1B6B6" : "none", 16);
    text(s, stages[i][0], x + 22, 215, 200, 27, 21, i === 1 ? C.red : C.ink, true);
    text(s, stages[i][1], x + 22, 261, 200, 86, 17, C.ink, false);
    if (i < stages.length - 1) text(s, "›", x + 252, 252, 26, 40, 34, C.red, true, "center");
    x += 290;
  }
  text(s, "Сценарій комунікаційного менеджера", 72, 424, 530, 30, 24, C.ink, true);
  text(s, "1. Перевіряє сигнал і першоджерела\n2. Узгоджує масштаб із технічною командою\n3. Передає підтримці фактичне формулювання проблеми", 72, 472, 620, 105, 20, C.ink, false);
  box(s, 770, 422, 405, 148, "#FFF2F2", "none", 16);
  text(s, "Перед тим як реагувати", 798, 442, 330, 30, 22, C.red, true);
  text(s, "Комунікаційний менеджер відкриває оригінал, перевіряє скільки є схожих згадок і вирішує, чи залучати інші команди.", 798, 486, 330, 72, 18, C.ink, true);
  foot(s, "Як MVP працює: відкриті джерела, аналіз і дашборд");
  note(s, "Склад: Google Play, App Store, Google News, 38 публічних Telegram-каналів; локальна модель тональності; SQLite; Next.js dashboard. Перед будь-якою ескалацією команда перевіряє першоджерело та масштаб. Швидкість одного циклу і статистика алертів винесені на наступний слайд.");
}

// 8 — speed and false signals
{
  const s = p.slides.add(); s.background.fill = C.white; header(s, "Швидкість та обмеження", "Що саме виміряли у MVP", 8);
  box(s, 72, 190, 345, 290, C.pale, "none", 18);
  text(s, "121 с", 105, 222, 245, 64, 54, C.red, true);
  text(s, "один запуск вручну\nвід збору до дашборда", 105, 300, 250, 53, 20, C.ink, true);
  text(s, "Збір 89 с · аналіз 1 с\nпошук сплеску 31 с", 105, 388, 260, 48, 16, C.muted, false);
  box(s, 468, 190, 345, 290, "#FFF2F2", "none", 18);
  text(s, "205", 501, 222, 245, 64, 54, C.red, true);
  text(s, "сигналів за рік\n1 система позначила як терміновий", 501, 300, 270, 53, 19, C.ink, true);
  text(s, "11.09 хибний сигнал: 15 записів виявилися 7 публікаціями через дублювання Google News. Дублювання виправили.\nОцінка перевірки: 2 фахівці × 1 година.", 501, 374, 280, 94, 14, C.muted, false);
  box(s, 864, 190, 345, 290, C.pale, "none", 18);
  text(s, "4%", 897, 222, 245, 64, 54, C.red, true);
  text(s, "скарг мають названу\nлокацію: 10 із 251", 897, 300, 270, 53, 20, C.ink, true);
  text(s, "Цього достатньо для перевірки,\nале не для рішення про інвестиції", 897, 388, 280, 48, 16, C.muted, false);
  text(s, "Запуски поки не відбуваються автоматично. Тому 121 секунда описує один ручний запуск, а не гарантований час виявлення.", 72, 543, 1080, 54, 19, C.ink, true);
  foot(s, "Виміряний час MVP · трудовитрати на перевірку хибної тривоги наведені як оцінка");
  note(s, "121 секунд — час одного ручного запуску від початку збору до дашборда. Планувальник не налаштований, тому регулярну затримку виявлення не вимірювали. Детектор сформував 205 сигналів за рік, з них один досяг рівня wake. PROJECT_LOG.md фіксує випадок 11.09: 15 записів виявилися 7 публікаціями, зібраними повторно через редиректи Google News; після виправлення дедуплікації тривога зникла. Дві людини × година — сценарна оцінка витрат на перевірку хибного сигналу, не грошова вартість. Географія: 10/251, 4%.");
}

// 9 — business value + honest limits
{
  const s = p.slides.add(); s.background.fill = C.white; header(s, "Бізнес-цінність пілота", "Що означає бюджетний сценарій 600 000 грн", 9);
  text(s, "154 грн", 72, 190, 300, 59, 47, C.red, true); text(s, "середня виручка з абонента за місяць", 72, 254, 330, 40, 17, C.ink, true);
  text(s, "× 12", 385, 207, 95, 45, 30, C.muted, false, "center");
  text(s, "1 848 грн", 510, 190, 330, 59, 47, C.ink, true); text(s, "середня виручка з абонента за рік", 510, 254, 330, 25, 17, C.ink, true);
  box(s, 72, 335, 766, 145, C.pale, "none", 18);
  text(s, "600 000 грн", 104, 360, 230, 38, 27, C.ink, true); text(s, "сценарний бюджет пілота на рік", 104, 403, 250, 30, 15, C.muted);
  text(s, "÷ 1 848 грн", 379, 373, 160, 30, 22, C.muted, false, "center");
  text(s, "≈325", 570, 353, 228, 46, 38, C.red, true, "center");
  text(s, "абонентів, утриманих на повні 12 місяців", 570, 403, 228, 40, 14, C.ink, true, "center");
  text(s, "Як перевірити сценарій", 895, 190, 270, 30, 23, C.red, true);
  text(s, "Пілот вимірює", 895, 242, 270, 29, 21, C.ink, true);
  text(s, "час до рішення команди\nчастку підтверджених сигналів\nвідтік проти контрольної групи", 895, 285, 285, 92, 17, C.ink, false);
  box(s, 895, 405, 285, 152, "#FFF2F2", "none", 16);
  text(s, "Важливо", 918, 425, 235, 25, 20, C.redDark, true);
  text(s, "Це поріг за виручкою, не прибутком. Він не враховує маржу та операційні витрати.", 918, 465, 235, 72, 15, C.ink, false);
  foot(s, "Vodafone Україна · І півріччя 2026 · 154 грн/міс; бюджет 600 000 грн/рік — сценарій");
  note(s, "Офіційне джерело ARPU: https://www.vodafone.ua/news/business-invest/vodafone-invests . Розрахунок: 600 000 ÷ (154×12) ≈325 абонентів, кожен утриманий повні 12 місяців. Це поріг за річною виручкою до маржі та операційних витрат, не прибуткова окупність і не підтверджений ефект системи. Бюджет — сценарій. Пілот перевіряє причинний ефект через знеособлену CRM та контрольну групу.");
}

// 10 — closing and live demo QR
{
  const s = p.slides.add(); s.background.fill = C.red;
  text(s, "VODAFONE · REPUTATIONX", 82, 72, 720, 28, 16, C.white, true);
  text(s, "Дякую!", 82, 230, 600, 80, 62, C.white, true);
  text(s, "Запитання?", 82, 330, 600, 50, 34, C.white, true);
  text(s, "Демо системи — за QR-кодом", 82, 438, 600, 34, 22, C.white, false);
  const qr = await fs.readFile(path.join(buildDir, "assets", "closing-dashboard-qr.jpg"));
  s.images.add({ blob: qr, contentType: "image/jpeg", alt: "QR-код для відкриття дашборду ReputationX", position: { left: 760, top: 145, width: 410, height: 410 }, fit: "contain", geometry: "rect" });
  text(s, "vodafone-reputation.vercel.app/dashboard", 710, 574, 510, 26, 14, C.white, false, "center");
  text(s, "10", 1150, 42, 58, 28, 15, C.white, true, "right");
  note(s, "QR-код із матеріалу користувача веде на https://vodafone-reputation.vercel.app/dashboard . Перевірено зчитуванням коду та HTTP-відповіддю 200.");
}

await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });
await (await PresentationFile.exportPptx(p)).save(candidatePath);

const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: "/Users/kristinadeneshchuk/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "vodafone-reputation-business-pitch-final-v11.validation.json"),
});
console.log(JSON.stringify({ finalPath, font, result }, null, 2));

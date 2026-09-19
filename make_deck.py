"""
Збирає презентацію у фірмових кольорах Vodafone.

    python make_deck.py

Усі числа в деку беруться з цього файлу й звірені з базою станом на
19 вересня 2026. Перерахувати: python run_pipeline.py --skip-collect

Правило тексту: заголовок несе зміст, на слайді мінімум слів, велика
цифра замість абзацу. Те, що говориться вголос, лежить у нотатках
доповідача (PITCH.md), а не на слайді.
"""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.util import Emu, Inches, Pt

# ------------------------------------------------------------------ стиль

RED = RGBColor(0xE6, 0x00, 0x00)        # фірмовий червоний Vodafone
INK = RGBColor(0x1A, 0x1A, 0x1A)
GREY = RGBColor(0x6B, 0x6B, 0x6B)
LIGHT = RGBColor(0xF4, 0xF4, 0xF4)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
FONT = 'Arial'

W, H = Inches(13.333), Inches(7.5)      # 16:9


def add_slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])   # порожній
    bg = s.background.fill
    bg.solid()
    bg.fore_color.rgb = WHITE
    return s


def box(slide, x, y, w, h, text, size=18, color=INK, bold=False,
        align=PP_ALIGN.LEFT, space_after=6, line=1.15):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    lines = text.split('\n')
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        p.line_spacing = line
        r = p.add_run()
        r.text = ln
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = FONT
    return tb


def rect(slide, x, y, w, h, fill=LIGHT, line=None):
    from pptx.enum.shapes import MSO_SHAPE
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    sh.fill.solid()
    sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(1)
    sh.shadow.inherit = False
    return sh


def bar(slide):
    """Червона смуга зліва — фірмовий акцент."""
    rect(slide, 0, 0, Inches(0.16), H, fill=RED)


def title(slide, text, size=32, y=Inches(0.7)):
    box(slide, Inches(0.8), y, Inches(11.8), Inches(1.4), text,
        size=size, bold=True, color=INK, line=1.05)


def note(slide, text):
    """Дрібний рядок унизу — джерело або застереження."""
    box(slide, Inches(0.8), Inches(6.75), Inches(11.8), Inches(0.5), text,
        size=11, color=GREY)


def speaker(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def big(slide, x, y, value, caption, w=Inches(3.0), value_size=48,
        color=RED):
    box(slide, x, y, w, Inches(0.9), value, size=value_size, bold=True,
        color=color, line=0.95)
    box(slide, x, y + Inches(0.85), w, Inches(0.8), caption, size=13,
        color=GREY)


# ------------------------------------------------------------------ слайди

def build():
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H

    # --- 0. Титул ---------------------------------------------------
    s = add_slide(prs)
    rect(s, 0, 0, W, H, fill=RED)
    box(s, Inches(1.0), Inches(2.4), Inches(11), Inches(1.6),
        'Репутація і кризи\nу відкритих джерелах',
        size=44, bold=True, color=WHITE, line=1.05)
    box(s, Inches(1.0), Inches(4.3), Inches(11), Inches(1.0),
        'Система бачить, що саме зламалось і де — а не просто «негатив виріс»',
        size=18, color=WHITE)
    box(s, Inches(1.0), Inches(5.6), Inches(11), Inches(0.6),
        '20 627 відкритих згадок за рік · вересень 2025 — вересень 2026',
        size=14, color=WHITE)
    speaker(s, 'Не читати слайд. Пауза, погляд у зал, і одразу перша цитата.')

    # --- 1. Хук і ціна питання --------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, '«Буду розривати контракт,\nкраще вже на Лайф перейти»', size=30)
    box(s, Inches(0.8), Inches(2.5), Inches(6.4), Inches(0.6),
        'Реальний відгук абонента Vodafone. Персональні дані не збираємо.',
        size=13, color=GREY)
    rect(s, Inches(7.4), Inches(2.1), Inches(5.1), Inches(4.0), fill=LIGHT)
    big(s, Inches(7.85), Inches(2.45), '1 848 ₴',
        'приносить один абонент за рік\nARPU 154 грн × 12 — звітність Vodafone',
        w=Inches(4.3), value_size=44)
    big(s, Inches(7.85), Inches(4.45), '11',
        'прямих заяв «я йду» за рік\nтільки ті, хто сказав уголос',
        w=Inches(4.3), value_size=34, color=INK)
    note(s, 'Внутрішня статистика показує тих, хто поскаржився. '
            'Ми показуємо тих, хто мовчки збирається піти.')
    speaker(s,
            'Цю людину Vodafone не побачив: вона не дзвонила в підтримку, '
            'написала у відгуку і пішла. Таких прямих заяв — одинадцять за рік. '
            'Кожен абонент — 1848 грн на рік за їхньою ж звітністю.')

    # --- 2. Звуження ------------------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, 'З 20 627 згадок залишили 251 —\nті, з якими можна щось зробити')
    rows = [('20 627', 'відкритих згадок за рік', GREY),
            ('9 610', 'згадок про Vodafone', GREY),
            ('1 130', 'скарг на Vodafone за всіма темами', INK),
            ('251', 'скарга про звʼязок — фокус системи', RED)]
    y = Inches(2.6)
    for value, caption, color in rows:
        box(s, Inches(0.9), y, Inches(2.2), Inches(0.6), value,
            size=28, bold=True, color=color, align=PP_ALIGN.RIGHT)
        box(s, Inches(3.4), y + Inches(0.12), Inches(8.5), Inches(0.5),
            caption, size=16, color=color)
        y += Inches(0.85)
    note(s, 'Решта скарг у базі: застосунок 241, тарифи 164, списання 59. '
            'Ми не вдаємо, що знаємо, як їх вирішити. '
            '251 — це кількість публічних скарг, а не постраждалих абонентів.')
    speaker(s,
            'Покриття — єдина тема, де результат аналізу веде інженера на '
            'конкретну локацію. Тому це не маленька вибірка, а дисциплінований фокус.')

    # --- 3. Архітектура ---------------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, 'Один потік даних — три різні дії')

    rect(s, Inches(0.9), Inches(2.3), Inches(11.6), Inches(0.75), fill=LIGHT)
    box(s, Inches(1.1), Inches(2.45), Inches(11.2), Inches(0.5),
        'Google Play · App Store · Google News · 38 публічних Telegram-каналів',
        size=15, color=INK)

    rect(s, Inches(0.9), Inches(3.25), Inches(11.6), Inches(0.75), fill=LIGHT)
    box(s, Inches(1.1), Inches(3.4), Inches(11.2), Inches(0.5),
        'Збір і дедуплікація  →  тональність · причина · локація · ризик  →  '
        'детектор криз  →  дашборд',
        size=15, color=INK)

    cols = [('Комунікації', 'як тема звучить публічно\nі чи підхопили медіа'),
            ('Технічна команда', 'що саме зламалось\nі де перевіряти мережу'),
            ('Підтримка', 'якими словами клієнт\nописує проблему')]
    x = Inches(0.9)
    for head, body in cols:
        rect(s, x, Inches(4.35), Inches(3.75), Inches(1.75), fill=WHITE, line=RED)
        box(s, x + Inches(0.25), Inches(4.55), Inches(3.3), Inches(0.5), head,
            size=17, bold=True, color=RED)
        box(s, x + Inches(0.25), Inches(5.1), Inches(3.3), Inches(0.9), body,
            size=13, color=GREY)
        x += Inches(3.95)
    note(s, 'Тільки відкриті джерела. Персональні дані авторів не збираємо. '
            'Модель тональності навчена на зірках відгуків — розмітка безкоштовна, '
            'усе рахується локально.')
    speaker(s, 'Це не три окремі модулі: один запис проходить одну перевірку, '
               'а далі кожна команда бачить свій зріз.')

    # --- 4. Демо: 2 липня -------------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, '2 липня 2026: атака РФ по інфраструктурі Vodafone')
    steps = [('Сплеск', '18 негативних згадок про масовий збій\nпроти норми 0 — це ×36'),
             ('Підтвердження', 'два різні типи джерел:\nновини й телеграм'),
             ('Медійна увага', 'окремий сигнал:\n14 публікацій від 14 видань за добу'),
             ('Дія з картки', '«Технічній службі — підтвердити масштаб.\n'
                              'Комунікації — заява протягом години»')]
    x = Inches(0.9)
    for head, body in steps:
        rect(s, x, Inches(2.5), Inches(2.75), Inches(2.6), fill=LIGHT)
        box(s, x + Inches(0.22), Inches(2.7), Inches(2.4), Inches(0.5), head,
            size=16, bold=True, color=RED)
        box(s, x + Inches(0.22), Inches(3.3), Inches(2.4), Inches(1.6), body,
            size=13, color=INK)
        x += Inches(2.9)
    box(s, Inches(0.9), Inches(5.5), Inches(11.6), Inches(0.9),
        'Комунікаційний менеджер отримує тривогу з готовою карткою: що сталось, '
        'скільки, звідки і чи це взагалі наша аварія.\n'
        'Текст заяви пише людина — система не вигадує офіційних формулювань.',
        size=14, color=INK)
    note(s, 'Останній блок — дослівний текст дії з системи, не переписаний для слайда.')
    speaker(s, 'Без системи про це дізнаються вранці, коли в чаті вже двадцять новин, '
               'і компанія виглядає так, ніби мовчала півдоби.')

    # --- 5. Скріни системи ------------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, 'Кожна цифра відкривається до реального повідомлення')
    for i, (cap, hint) in enumerate([
            ('Головна: підсумок періоду, головна причина,\n'
             'тижневий графік із нормою',
             'СКРІН A\nголовна сторінка дашборда'),
            ('Стрічка: підписи «Скарга», «Похвала»,\n«Змішано», «Новина»',
             'СКРІН B\nстрічка повідомлень')]):
        x = Inches(0.9) + i * Inches(6.0)
        rect(s, x, Inches(2.3), Inches(5.6), Inches(3.1), fill=LIGHT, line=GREY)
        box(s, x + Inches(0.3), Inches(3.4), Inches(5.0), Inches(1.0), hint,
            size=15, bold=True, color=GREY, align=PP_ALIGN.CENTER)
        box(s, x, Inches(5.55), Inches(5.6), Inches(0.9), cap,
            size=13, color=INK)
    note(s, 'Система не називає скаргою все підряд: 127 матеріалів медіа '
            'відділено від голосу абонентів, 103 рекламні пости прибрано, '
            '35 галузевих статей винесено окремо.')
    speaker(s, 'Керівник бачить підсумок, аналітик за один клік — записи, з яких '
               'той підсумок склався, і оригінал кожного повідомлення.')

    # --- 6. Блекаути -------------------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, '84% скарг на звʼязок під час блекаутів —\nу листопаді–лютому')
    big(s, Inches(0.9), Inches(2.9), '141', 'скарга за рік про звʼязок\nпід час відключень світла',
        w=Inches(3.4), value_size=46)
    big(s, Inches(4.6), Inches(2.9), '118', 'з них в опалювальний сезон',
        w=Inches(3.4), value_size=46, color=INK)
    box(s, Inches(8.3), Inches(2.9), Inches(4.2), Inches(2.4),
        'Це не аварія мережі. Станція сідає на акумулятор, і абонент '
        'лишається без звʼязку.\n\n'
        'Рішення — резервне живлення, а не ремонт мережі. І поставити його '
        'треба до жовтня: у січні це гроші на 40% сезону.',
        size=14, color=INK)
    note(s, 'Чесно: медіана «12 годин без звʼязку» порахована лише з 7 повідомлень, '
            'де тривалість названа прямо — це орієнтир, не вимірювання. '
            'Місце назване у 18 зі 141 скарги, тому карту інвестицій ми з цього не робимо.')
    speaker(s, 'Знахідка, якої не видно у внутрішній статистиці: формально оператор '
               'ні до чого, фактично це його проблема і його бюджет.')

    # --- 7. Швидкість, помилки, межі --------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, '121 секунда від джерела до екрана.\nОдна тривога за рік')
    cols = [
        ('Швидкість', 'збір 89 с\nаналіз 1 с\nдетекція 31 с\nекспорт 0,04 с\n\n'
                      'Планувальник не налаштований: це час одного проходу, '
                      'а не заявлений термін виявлення.'),
        ('Хибні спрацювання', '205 сигналів за рік\nрівня «будити» — 1\n\n'
                              'Ціна помилки: двоє людей уночі й година перевірки.\n'
                              '11 вересня система підняла тривогу на дублях новин — '
                              'ми це знайшли й виправили.'),
        ('Чого не бачимо', 'локація є у 4% скарг\n\n'
                           'множник мовчазних невідомий\n\n'
                           'одна криза за рік — мало для статистики'),
    ]
    x = Inches(0.9)
    for head, body in cols:
        rect(s, x, Inches(2.5), Inches(3.75), Inches(3.6), fill=LIGHT)
        box(s, x + Inches(0.25), Inches(2.7), Inches(3.3), Inches(0.5), head,
            size=17, bold=True, color=RED)
        box(s, x + Inches(0.25), Inches(3.3), Inches(3.3), Inches(2.6), body,
            size=13, color=INK)
        x += Inches(3.95)
    note(s, 'Вигадана локація веде інженерів туди, де нічого не сталось, '
            'тому ми її не вгадуємо.')
    speaker(s, 'Найважливіший слайд для довіри. Казати прямо, не пом’якшувати.')

    # --- 8. Цінність і пілот ----------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, 'Окупається, якщо допоможе втримати\n27 абонентів на місяць із 15 мільйонів')
    rect(s, Inches(0.9), Inches(2.6), Inches(5.6), Inches(3.3), fill=LIGHT)
    box(s, Inches(1.2), Inches(2.85), Inches(5.0), Inches(2.9),
        '1 848 ₴ на рік з абонента\nARPU 154 грн × 12 — звітність Vodafone\n\n'
        '600 000 ₴ на рік — бюджет системи\nсценарій, не вартість прототипу\n\n'
        '600 000 ÷ 1 848 = 325 абонентів на рік\n= 27 на місяць, або 0,002% бази',
        size=14, color=INK)
    rect(s, Inches(6.9), Inches(2.6), Inches(5.6), Inches(3.3), fill=WHITE, line=RED)
    box(s, Inches(7.2), Inches(2.85), Inches(5.0), Inches(0.5),
        'Що міряє пілот', size=17, bold=True, color=RED)
    box(s, Inches(7.2), Inches(3.45), Inches(5.0), Inches(2.3),
        '· час від сигналу до рішення команди\n'
        '· частка сигналів, які підтвердилися\n'
        '· утримання після реакції: відтік у групі\n  зі сигналом проти контрольної\n\n'
        'Для запуску: планувальник, знеособлений\nдоступ до бази, правила ескалації.',
        size=14, color=INK)
    note(s, 'Скільки абонентів пішло мовчки, знає тільки Vodafone — це одна '
            'вивантажка з їхньої CRM. Саме вона перетворює нашу оцінку на їхню цифру.')
    speaker(s, 'Ми не називаємо вигадану суму зекономлених мільйонів. '
               'Ми ставимо вимірюваний поріг: якщо пілот не дає навіть цього — зупиніть його.')

    # --- 9. Додаток: точність ---------------------------------------
    s = add_slide(prs)
    bar(s)
    title(s, 'Додаток: що саме ми виміряли')
    items = [('91,2%', 'точність тональності\nна 2 215 відкладених прикладах'),
             ('86,5%', 'повнота по негативу\nз десяти скарг ловимо девʼять'),
             ('81%', 'точність причини\nна 90 прикладах, розмічених руками'),
             ('~87%', 'точність локації\nна 30 перевірених вручну')]
    x = Inches(0.9)
    for value, caption in items:
        big(s, x, Inches(2.8), value, caption, w=Inches(2.8), value_size=38)
        x += Inches(2.95)
    box(s, Inches(0.9), Inches(5.0), Inches(11.6), Inches(1.3),
        'Ми не обіцяємо точність, якої не міряли. Оцінки релевантності й '
        'конструктивності — це зважені суми ознак, а не ймовірності: під ними '
        'немає навченої моделі з калібруванням, і ми не називаємо їх імовірністю.\n'
        'Розмітка й код перевірки — у репозиторії. Порівняння операторів: '
        'Vodafone 75% негативу, Київстар 88%, lifecell 77% — це репутаційний '
        'сигнал у відкритих джерелах, а не вимір якості мережі.',
        size=13, color=INK)
    note(s, 'Джерела: vodafone.ua/news/business-invest/vodafone-invests · '
            'робоча версія: vodafone-reputation.vercel.app/dashboard')

    return prs


if __name__ == '__main__':
    out = 'Vodafone_Reputation_Pitch.pptx'
    build().save(out)
    print('готово:', out)

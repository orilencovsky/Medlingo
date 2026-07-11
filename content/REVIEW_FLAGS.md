# Dictionary review flags — 2026-07-11 import

The 1085-entry import was model-enriched (nikud, POS, level, gender, plural, root, en).
Everything needs the language-expert pass, but these entries were explicitly flagged as
uncertain during enrichment — review them first.

## Sense picked without a hint (homograph, alternate sense noted in `notes`)
- תיקן — chose verb "to fix" (vs noun "cockroach")
- כעס — noun "anger" (vs verb) · לחץ — noun "pressure" (vs verb) · כתב — verb (vs noun כְּתָב)
- מדד — verb "to measure" (vs noun "index") · מוכר — noun "seller" (vs adj "familiar")
- נעל — noun "shoe" (vs verb "locked") · נהג — noun "driver" (vs verb "drove")
- מרץ — month "March" (vs "vigor") · מר — "bitter" (vs "Mr.")
- מילא — interjection "never mind" (vs verb) · מלווה — "escort" (vs "loan")
- שטף — verb "to rinse" (vs noun "flow") · שמן — noun "oil" (vs adj "fat")
- שקט — noun "silence" (vs adj) · רעב — adj "hungry" (vs noun "hunger")
- קצב — "rhythm" (vs "butcher") · סגר — verb "to close" (vs noun "lockdown")
- עובד — noun "employee" (vs verb) · עבר — verb "to pass" (vs noun "past")
- עם — preposition "with" (id im-with; vs noun "people") · פחד — noun · פתח — verb · צמא — adj
- כבד — noun "liver" (vs adj "heavy") · ירק — "vegetable" (vs "greenery")
- גזר — "carrot" (vs verb) · הבא — adj "next" (vs "bring!") · הגה — "steering wheel" (vs verb)
- דיווח — noun reading · גובה — "height" (vs "tax collector") · בטח — adverb "of course" (vs verb)
- עצמי — adjective (vs pronoun "myself") · חי — adjective · נראה — past נִרְאָה

## Gender uncertain
- אות (נ), זרת (נ), פנים (נ), צומת (ז), שמש (נ), סכין (נ), גרב (ז), ימין (ז),
  תכלת (נ), שתן (ז), חדשות (plurale tantum), month names (ז): אפריל אוגוסט אוקטובר דצמבר פברואר

## Nikud uncertain (mostly loanwords / dagesh / holam spelling)
- Loanwords: אלרגי אימייל אינטרנט אוטו בננה בלגן ביי ביופסיה כרוני פארק פרוצדורה פלסטר
  פברואר היי סבבה חולצה
- Dagesh/vowel: אזור חמישים זיהום חלש הפנייה התאוששות זכר(×2) קרסול רטוב שחור רעיון
  ריבוע קיבה שנייה שיחה שיער שלפוחית כדאי כווייה מסוכן במיוחד אחראי מזגן מאוורר מעבדה
  מ(citation) סבתא סתיו סיסמה סיעוד נעלם חמאה חנייה יכל חייב ירייה דוגמה תכלת
- הכל — POS pronoun (defensible noun) · חמישי — ordinal tagged adjective · כל — citation form

## Root uncertain / left empty
- אבחנה גרעין דעה מינון נייר מין מסקנה מטרה מותר (root-choice)

## Systematic conventions to confirm with the expert
1. **Ktiv haser in nikud column**: menukad forms drop redundant maters (אדום → אָדֹם,
   בישל → בִּשֵּׁל) — 170 entries where the vocalized skeleton differs from the headword.
   Confirm this is the desired display convention (vs vocalizing the ktiv-male form).
2. **Levels skew**: 250×L1, 818×L2, 17×L3 — model judgment; expert may want to rebalance.
3. **ילדה verb** (yalda-verb, "gave birth") cited in 3fs as in the source list, not 3ms.
4. **Multiword headwords** keep the source list's hyphens (בית-חולים) while nikud uses
   spaces (אֵין עַל מָה); existing entries (לחץ דם) use spaces in both.

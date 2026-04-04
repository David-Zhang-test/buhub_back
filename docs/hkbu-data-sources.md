# HKBU Official Data Sources

Updated: 2026-03-14

This project now uses HKBU official programme pages as the canonical source for registration major options and `MAJOR` rating seeds.
It also uses official HKBU course information for the current `COURSE` seed set.

## Programme sources

- Direct Admission Schemes (2026 entry participating programmes): https://admissions.hkbu.edu.hk/admissions/direct-admission-schemes.html
- Faculty of Arts and Social Sciences BA broad-based majors: https://admissions.hkbu.edu.hk/content/ao/en/programmes/faculty-of-arts-and-social-sciences/bachelor-of-arts-hons-chinese-language-and-literature-creative-and-professional-writing-english-language-and-literature-humanities-translation-year1.html
- Faculty of Arts and Social Sciences BA/BSocSc broad-based majors: https://admissions.hkbu.edu.hk/programmes/faculty-of-arts-and-social-sciences/bachelor-of-arts-hons-bachelor-of-social-sciences-hons-european-studies-french-german-stream-geography-global-and-china-studies-government-and-international-studies-history-sociology-year1.html
- Religion, Philosophy and Ethics: https://admissions.hkbu.edu.hk/programmes/faculty-of-arts-and-social-sciences/bachelor-of-arts-hons-in-religion-philosophy-and-ethics-year1.html
- Faculty of Science BSc year 1 admissions: https://admissions.hkbu.edu.hk/programmes/faculty-of-science/bachelor-of-science-hons-year1.html
- School of Business BBA year 1 admissions: https://admissions.hkbu.edu.hk/programmes/school-of-business/bachelor-of-business-administration-hons-year1.html
- School of Communication year 1 admissions: https://admissions.hkbu.edu.hk/programmes/school-of-communication/year1-admissions.html
- School of Creative Arts Music / Creative Industries: https://admissions.hkbu.edu.hk/programmes/school-of-creative-arts/bachelor-of-arts-hons-bachelor-of-music-hons-in-creative-industries-or-music-year1.html
- Acting for Global Screen: https://admissions.hkbu.edu.hk/programmes/school-of-creative-arts/bachelor-of-fine-arts-hons-in-acting-for-global-screen-year1.html
- School of Chinese Medicine: https://admissions.hkbu.edu.hk/programmes/school-of-chinese-medicine/bachelor-of-chinese-medicine-and-bachelor-of-science-hons-in-biomedical-science-year1.html
- Digital Futures and Humanities: https://admissions.hkbu.edu.hk/content/ao/en/programmes/faculty-of-arts-and-social-sciences/bachelor-of-arts-and-science-hons-in-digital-futures-and-humanities-year1.html
- Innovation in Health and Social Well-Being: https://admissions.hkbu.edu.hk/programmes/faculty-of-arts-and-social-sciences/bachelor-of-social-sciences-hons-bachelor-of-science-hons-in-innovation-in-health-and-social-well-being-year1.html
- Senior-year / top-up programme cross-check: https://admissions.hkbu.edu.hk/en/degree-diploma.html

## Course sources

The current `COURSE` seed covers 669 real HKBU courses from the public `2025-26 Spring Semester Physical Exchange` course list.

Primary official source used for course codes and titles:

- HKBU Academic Registry public exchange course list: https://ar.hkbu.edu.hk/student-services/incoming-exchange-and-extended-study-programme/course-list/for-2025-26-spring-semester-physical-exchange

Implementation notes:

- The seed keeps the official course code and title from the public page.
- `id` values normalize spaces out of codes when needed, for example `ITS 2005` becomes `courseHKBUITS2005`.

## Professor roster sources

The current `TEACHER` seed covers 100 HKBU faculty / teaching staff entries across these units:

- Department of Management, Marketing and Information Systems
- Department of Accountancy, Economics and Finance
- Department of Computer Science
- Department of Chinese Language and Literature
- Department of English Language and Literature
- Department of Humanities and Creative Writing
- Department of Government and International Studies
- Department of Geography
- Department of History
- Department of Sociology
- Department of Religion and Philosophy
- Department of Translation, Interpreting and Intercultural Studies
- Department of Communication Studies
- Department of Journalism
- Department of Interactive Media
- Department of Sport, Physical Education and Health
- Academy of Music
- Department of Chemistry
- Department of Mathematics
- Department of Physics
- Department of Biology
- Academy of Visual Arts
- Academy of Film
- School of Chinese Medicine

The current scope is intentionally filtered to people whose official HKBU pages identify them as `Professor` or `Lecturer`.

When expanding `TEACHER` rating seeds further, use only official HKBU staff directories:

- HKBU Scholars organisation/person pages, for example: https://scholars.hkbu.edu.hk/en/organisations/language-centre/persons/
- Faculty / school academic staff pages under `hkbu.edu.hk`, `scholars.hkbu.edu.hk`, or programme/department sites linked from official HKBU pages.

Current teacher seed implementation:

- Runtime seed fixture: `buhub_back/src/lib/ratings.ts`

Email normalization note:

- HKBU Scholars search snippets often omit the `@` sign in displayed email strings, for example `cpchanhkbu.eduhk`.
- In this repo those values are normalized to the inferred official address format, for example `cpchan@hkbu.edu.hk`.

Recommended normalization fields for professor import:

- English name
- Chinese name
- title
- school / faculty
- department
- email
- official profile URL

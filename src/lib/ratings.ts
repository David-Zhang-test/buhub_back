import { RatingCategory, type Prisma } from "@prisma/client";
import { HKBU_MAJOR_RATING_ITEMS } from "@/src/data/hkbuMajors";
import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { NotFoundError, ValidationError } from "@/src/lib/errors";

type RatingDimensionFixture = {
  key: string;
  label: string;
  left: string;
  right: string;
};

type RatingSummary = {
  id: string;
  category: RatingCategory;
  name: string;
  department: string;
  code?: string | null;
  email?: string | null;
  location?: string | null;
  avatar?: string | null;
  scores: Array<{ key: string; label: string; value: number }>;
  tags: string[];
  tagCounts: Record<string, number>;
  ratingCount: number;
  recentCount: number;
  scoreVariance: number;
};

const DIMENSION_FIXTURES: Record<RatingCategory, RatingDimensionFixture[]> = {
  [RatingCategory.TEACHER]: [
    { key: "teaching", label: "Teaching Skill", left: "Boring", right: "Engaging" },
    { key: "grading", label: "Grading", left: "Harsh", right: "Generous" },
    { key: "accessibility", label: "Accessibility", left: "Hard to Reach", right: "Always Available" },
  ],
  [RatingCategory.COURSE]: [
    { key: "grading", label: "Grading", left: "Harsh", right: "Generous" },
    { key: "exam", label: "Exam Difficulty", left: "Difficult", right: "Easy" },
    { key: "workload", label: "Workload", left: "Heavy", right: "Light" },
  ],
  [RatingCategory.CANTEEN]: [
    { key: "taste", label: "Taste", left: "Bad", right: "Delicious" },
    { key: "value", label: "Value", left: "Pricey", right: "Great Value" },
    { key: "cleanliness", label: "Cleanliness", left: "Dirty", right: "Clean" },
  ],
  [RatingCategory.MAJOR]: [
    { key: "career", label: "Career Prospect", left: "Bleak", right: "Bright" },
    { key: "curriculum", label: "Curriculum", left: "Average", right: "Excellent" },
    { key: "satisfaction", label: "Satisfaction", left: "Unsatisfied", right: "Satisfied" },
  ],
};

const HKBU_TEACHER_SEED_FIXTURES = [
  { id: "teacherHKBUAlbertMAhn", name: "Albert M. AHN", department: "Department of Management, Marketing and Information Systems", email: "albertahn@hkbu.edu.hk" },
  { id: "teacherHKBUAlisonChan", name: "Alison CHAN", department: "Department of Management, Marketing and Information Systems", email: "alisonchan@hkbu.edu.hk" },
  { id: "teacherHKBUWaKimmyChan", name: "Wa Kimmy CHAN", department: "Department of Management, Marketing and Information Systems", email: "kimmychan@hkbu.edu.hk" },
  { id: "teacherHKBUSongChang", name: "Song CHANG", department: "Department of Management, Marketing and Information Systems", email: "schang@hkbu.edu.hk" },
  { id: "teacherHKBUAmyYYChen", name: "Amy Y Y CHEN", department: "Department of Management, Marketing and Information Systems", email: "chenyy@hkbu.edu.hk" },
  { id: "teacherHKBURockyPengChen", name: "Rocky Peng CHEN", department: "Department of Management, Marketing and Information Systems", email: "rockychen@hkbu.edu.hk" },
  { id: "teacherHKBUChristyMKCheung", name: "Christy M K CHEUNG", department: "Department of Management, Marketing and Information Systems", email: "ccheung@hkbu.edu.hk" },
  { id: "teacherHKBUJamieYHCheung", name: "Jamie Y H CHEUNG", department: "Department of Management, Marketing and Information Systems", email: "yhcheung@hkbu.edu.hk" },
  { id: "teacherHKBUMartaDowejko", name: "Marta DOWEJKO", department: "Department of Management, Marketing and Information Systems", email: "mdowejko@hkbu.edu.hk" },
  { id: "teacherHKBULuciaFung", name: "Lucia FUNG", department: "Department of Management, Marketing and Information Systems", email: "luciafung@hkbu.edu.hk" },
  { id: "teacherHKBUCandyKYHo", name: "Candy K Y HO", department: "Department of Management, Marketing and Information Systems", email: "candyho@hkbu.edu.hk" },
  { id: "teacherHKBUGuohuaEmilyHuang", name: "Guohua Emily HUANG", department: "Department of Management, Marketing and Information Systems", email: "mnhghh@hkbu.edu.hk" },
  { id: "teacherHKBUXuHuang", name: "Xu HUANG", department: "Department of Management, Marketing and Information Systems", email: "xuhuang@hkbu.edu.hk" },
  { id: "teacherHKBUYunhuiHuang", name: "Yunhui HUANG", department: "Department of Management, Marketing and Information Systems", email: "yunhuihuang@hkbu.edu.hk" },
  { id: "teacherHKBUAmandaAwYong", name: "Amanda AW YONG", department: "Department of Accountancy, Economics and Finance", email: "awyongamanda@hkbu.edu.hk" },
  { id: "teacherHKBUKangHuaCao", name: "Kang Hua CAO", department: "Department of Accountancy, Economics and Finance", email: "kanghuacao@hkbu.edu.hk" },
  { id: "teacherHKBUKarLunChan", name: "Kar Lun CHAN", department: "Department of Accountancy, Economics and Finance", email: "ckarlun@hkbu.edu.hk" },
  { id: "teacherHKBUChunPongChan", name: "Chun Pong CHAN", department: "Department of Computer Science", email: "cpchan@hkbu.edu.hk" },
  { id: "teacherHKBUMandelWMChan", name: "Mandel W M CHAN", department: "Department of Computer Science", email: "mandel@hkbu.edu.hk" },
  { id: "teacherHKBUJieChen", name: "Jie CHEN", department: "Department of Computer Science", email: "chenjie@hkbu.edu.hk" },
  { id: "teacherHKBULiChen", name: "Li CHEN", department: "Department of Computer Science", email: "lichen@hkbu.edu.hk" },
  { id: "teacherHKBUYifanChenCs", name: "Yifan CHEN", department: "Department of Computer Science", email: "yifanch@hkbu.edu.hk" },
  { id: "teacherHKBUKamKongCheng", name: "Kam Kong CHENG", department: "Department of Computer Science", email: "kennycheng@hkbu.edu.hk" },
  { id: "teacherHKBUJosBartels", name: "Jos BARTELS", department: "Department of Communication Studies", email: "jbartels@hkbu.edu.hk" },
  { id: "teacherHKBUKaraKWChan", name: "Kara K W CHAN", department: "Department of Communication Studies", email: "karachan@hkbu.edu.hk" },
  { id: "teacherHKBULeanneChang", name: "Leanne CHANG", department: "Department of Communication Studies", email: "leannechang@hkbu.edu.hk" },
  { id: "teacherHKBUAnfanChen", name: "Anfan CHEN", department: "Department of Communication Studies", email: "anfanchen@hkbu.edu.hk" },
  { id: "teacherHKBUKingCheungChan", name: "King Cheung CHAN", department: "Department of Journalism", email: "chankc@hkbu.edu.hk" },
  { id: "teacherHKBUSherwinChua", name: "Sherwin CHUA", department: "Department of Journalism", email: "sherwinchua@hkbu.edu.hk" },
  { id: "teacherHKBURobinEwing", name: "Robin EWING", department: "Department of Journalism", email: "ewing@hkbu.edu.hk" },
  { id: "teacherHKBUTikFanChan", name: "Tik Fan CHAN", department: "Department of Interactive Media", email: "tc_chan@hkbu.edu.hk" },
  { id: "teacherHKBUWadeLTChan", name: "Wade L T CHAN", department: "Department of Interactive Media", email: "wadechan@hkbu.edu.hk" },
  { id: "teacherHKBUKaNinChow", name: "Ka Nin CHOW", department: "Department of Interactive Media", email: "knchow@hkbu.edu.hk" },
  { id: "teacherHKBUCharlesGCFeng", name: "Charles G.C. FENG", department: "Department of Interactive Media", email: "charlesfeng@hkbu.edu.hk" },
  { id: "teacherHKBURobertoAlonsoTrillo", name: "Roberto ALONSO TRILLO", department: "Academy of Music", email: "robertoalonso@hkbu.edu.hk" },
  { id: "teacherHKBUTaurinBarrera", name: "Taurin BARRERA", department: "Academy of Music", email: "taurin@hkbu.edu.hk" },
  { id: "teacherHKBUJoydeepBhattacharya", name: "Joydeep BHATTACHARYA", department: "Academy of Music", email: "jbhattacharya@hkbu.edu.hk" },
  { id: "teacherHKBUWeiShenAik", name: "Wei Shen AIK", department: "Department of Chemistry", email: "aikweishen@hkbu.edu.hk" },
  { id: "teacherHKBUAngeloHomayounAll", name: "Angelo Homayoun ALL", department: "Department of Chemistry", email: "angelo@hkbu.edu.hk" },
  { id: "teacherHKBUZongweiCai", name: "Zongwei CAI", department: "Department of Chemistry", email: "zwcai@hkbu.edu.hk" },
  { id: "teacherHKBUMingYenCheng", name: "Ming-Yen CHENG", department: "Department of Mathematics", email: "chengmingyen@hkbu.edu.hk" },
  { id: "teacherHKBUShunLingChiang", name: "Shun Ling CHIANG", department: "Department of Mathematics", email: "gcling@hkbu.edu.hk" },
  { id: "teacherHKBUMauHingChan", name: "Mau Hing CHAN", department: "Department of Physics", email: "mhchan@hkbu.edu.hk" },
  { id: "teacherHKBUWingHongChoi", name: "Wing Hong CHOI", department: "Department of Physics", email: "whchoiso@hkbu.edu.hk" },
  { id: "teacherHKBUQianHu", name: "Qian HU", department: "Department of Physics", email: "qianhu@hkbu.edu.hk" },
  { id: "teacherHKBUYangBi", name: "Yang BI", department: "Department of Biology", email: "beyond@hkbu.edu.hk" },
  { id: "teacherHKBUWaiYeeChan", name: "Wai Yee CHAN", department: "Department of Biology", email: "veronica_chan@hkbu.edu.hk" },
  { id: "teacherHKBUKaLoonAllenCheung", name: "Ka Loon Allen CHEUNG", department: "Department of Biology", email: "akcheung@hkbu.edu.hk" },
  { id: "teacherHKBUKachiChan", name: "Kachi CHAN", department: "Academy of Visual Arts", email: "kachichan@hkbu.edu.hk" },
  { id: "teacherHKBUSeeKwongChan", name: "See Kwong CHAN", department: "Academy of Visual Arts", email: "seekwong@hkbu.edu.hk" },
  { id: "teacherHKBULornaAliceMoiraDillon", name: "Lorna Alice Moira DILLON", department: "Academy of Visual Arts", email: "ldillon@hkbu.edu.hk" },
  { id: "teacherHKBUTszOnSavilleChan", name: "Tsz On Saville CHAN", department: "Academy of Film", email: "savillechan@hkbu.edu.hk" },
  { id: "teacherHKBUYiminChen", name: "Yimin CHEN", department: "Academy of Film", email: "cymfilm@hkbu.edu.hk" },
  { id: "teacherHKBUJuriHwang", name: "Juri HWANG", department: "Academy of Film", email: "jurihwang@hkbu.edu.hk" },
  { id: "teacherHKBUPAsthana", name: "P. ASTHANA", department: "School of Chinese Medicine", email: "pallavi@hkbu.edu.hk" },
  { id: "teacherHKBUZhaoxiangBian", name: "Zhaoxiang BIAN", department: "School of Chinese Medicine", email: "bzxiang@hkbu.edu.hk" },
  { id: "teacherHKBUAdamCraigSchwartz", name: "Adam Craig SCHWARTZ", department: "Department of Chinese Language and Literature", email: "acschwartz@hkbu.edu.hk" },
  { id: "teacherHKBUEmilyChowQuesada", name: "Emily CHOW-QUESADA", department: "Department of English Language and Literature", email: "echowq@hkbu.edu.hk" },
  { id: "teacherHKBUMingxingLi", name: "Mingxing LI", department: "Department of English Language and Literature", email: "mingxingli@hkbu.edu.hk" },
  { id: "teacherHKBUWinnieChor", name: "Winnie CHOR", department: "Department of English Language and Literature", email: "winniechor@hkbu.edu.hk" },
  { id: "teacherHKBUAngelaHe", name: "Angela K. C. HE", department: "Department of English Language and Literature", email: "angelahe@hkbu.edu.hk" },
  { id: "teacherHKBUYiuFaiChow", name: "Yiu Fai CHOW", department: "Department of Humanities and Creative Writing", email: "yiufaichow@hkbu.edu.hk" },
  { id: "teacherHKBULucettaKam", name: "Lucetta Y. K. KAM", department: "Department of Humanities and Creative Writing", email: "lucettakam@hkbu.edu.hk" },
  { id: "teacherHKBUGladysChong", name: "Gladys Pak Lei CHONG", department: "Department of Humanities and Creative Writing", email: "gladyschong@hkbu.edu.hk" },
  { id: "teacherHKBUEmilyYuZong", name: "Emily Yu ZONG", department: "Department of Humanities and Creative Writing", email: "emilyzong@hkbu.edu.hk" },
  { id: "teacherHKBUYiKang", name: "Yi KANG", department: "Department of Government and International Studies", email: "ykang@hkbu.edu.hk" },
  { id: "teacherHKBUJaeminShim", name: "Jaemin SHIM", department: "Department of Government and International Studies", email: "jaeminshim@hkbu.edu.hk" },
  { id: "teacherHKBUFabianRaetzer", name: "Fabian RAETZER", department: "Department of Government and International Studies", email: "fabianraetzer@hkbu.edu.hk" },
  { id: "teacherHKBUDonggenWang", name: "Donggen WANG", department: "Department of Geography", email: "donggenwang@hkbu.edu.hk" },
  { id: "teacherHKBUMengGao", name: "Meng GAO", department: "Department of Geography", email: "menggao@hkbu.edu.hk" },
  { id: "teacherHKBUShokoSakaiUshio", name: "Shoko SAKAI-USHIO", department: "Department of Geography", email: "shoko@hkbu.edu.hk" },
  { id: "teacherHKBUPuHao", name: "Pu HAO", department: "Department of Geography", email: "puhao@hkbu.edu.hk" },
  { id: "teacherHKBUDaphneMah", name: "Daphne H. M. MAH", department: "Department of Geography", email: "daphnemah@hkbu.edu.hk" },
  { id: "teacherHKBUMankongWong", name: "Man Kong WONG", department: "Department of History", email: "mankong@hkbu.edu.hk" },
  { id: "teacherHKBUWingChungFan", name: "Wing Chung FAN", department: "Department of History", email: "wingfan@hkbu.edu.hk" },
  { id: "teacherHKBUKamChauKwok", name: "Kam Chau KWOK", department: "Department of History", email: "kamchaukwok@hkbu.edu.hk" },
  { id: "teacherHKBUYuenHanLaw", name: "Yuen Han LAW", department: "Department of History", email: "yhanslaw@hkbu.edu.hk" },
  { id: "teacherHKBUSebastianPahs", name: "Sebastian PAHS", department: "Department of History", email: "spahs@hkbu.edu.hk" },
  { id: "teacherHKBUAdamCheung", name: "Adam Y. C. CHEUNG", department: "Department of Sociology", email: "adamcheung@hkbu.edu.hk" },
  { id: "teacherHKBUGinaLai", name: "Gina Anne T. Y. LAI", department: "Department of Sociology", email: "ginalai@hkbu.edu.hk" },
  { id: "teacherHKBUIuliaGheorghiu", name: "Iulia GHEORGHIU", department: "Department of Sociology", email: "iuliag@hkbu.edu.hk" },
  { id: "teacherHKBUWaiLuenKwok", name: "Wai Luen KWOK", department: "Department of Religion and Philosophy", email: "wlkwok@hkbu.edu.hk" },
  { id: "teacherHKBUGeorgeMak", name: "George Tsai Wei MAK", department: "Department of Religion and Philosophy", email: "georgemak@hkbu.edu.hk" },
  { id: "teacherHKBUBaldwinWong", name: "Baldwin WONG", department: "Department of Religion and Philosophy", email: "baldwinwong@hkbu.edu.hk" },
  { id: "teacherHKBUAndrewLoke", name: "Andrew LOKE", department: "Department of Religion and Philosophy", email: "andrewloke@hkbu.edu.hk" },
  { id: "teacherHKBUAndrewBrenner", name: "Andrew BRENNER", department: "Department of Religion and Philosophy", email: "andrewbrenner@hkbu.edu.hk" },
  { id: "teacherHKBUKevinTurner", name: "Kevin M. TURNER", department: "Department of Religion and Philosophy", email: "kturner@hkbu.edu.hk" },
  { id: "teacherHKBUKwanKaiMan", name: "Kwan Kai-man", department: "Department of Religion and Philosophy", email: "kkwan@hkbu.edu.hk" },
  { id: "teacherHKBURobertJohnNeather", name: "Robert John NEATHER", department: "Department of Translation, Interpreting and Intercultural Studies", email: "rneather@hkbu.edu.hk" },
  { id: "teacherHKBUChuanYu", name: "Chuan YU", department: "Department of Translation, Interpreting and Intercultural Studies", email: "clarachuanyu@hkbu.edu.hk" },
  { id: "teacherHKBUNanZhao", name: "Nan ZHAO", department: "Department of Translation, Interpreting and Intercultural Studies", email: "nanzhao@hkbu.edu.hk" },
  { id: "teacherHKBULuisDamianMorenoGarcia", name: "Luis Damian MORENO GARCIA", department: "Department of Translation, Interpreting and Intercultural Studies", email: "luismoreno@hkbu.edu.hk" },
  { id: "teacherHKBUWaiPingYau", name: "Wai Ping YAU", department: "Department of Translation, Interpreting and Intercultural Studies", email: "wpyau@hkbu.edu.hk" },
  { id: "teacherHKBUJessicaYeung", name: "Jessica YEUNG", department: "Department of Translation, Interpreting and Intercultural Studies", email: "jyeung@hkbu.edu.hk" },
  { id: "teacherHKBUPatrickWCLau", name: "Patrick W C LAU", department: "Department of Sport, Physical Education and Health", email: "wclau@hkbu.edu.hk" },
  { id: "teacherHKBUWendyYJHuang", name: "Wendy Y J HUANG", department: "Department of Sport, Physical Education and Health", email: "wendyhuang@hkbu.edu.hk" },
  { id: "teacherHKBUYanpingDuan", name: "Yanping DUAN", department: "Department of Sport, Physical Education and Health", email: "duanyp@hkbu.edu.hk" },
  { id: "teacherHKBUJiaoJiao", name: "Jiao JIAO", department: "Department of Sport, Physical Education and Health", email: "jojojiao@hkbu.edu.hk" },
  { id: "teacherHKBURashmiSupriya", name: "Rashmi-Supriya", department: "Department of Sport, Physical Education and Health", email: "rashmisupriya@hkbu.edu.hk" },
  { id: "teacherHKBUKaKiWong", name: "Ka Ki WONG", department: "Department of Sport, Physical Education and Health", email: "kilowong@hkbu.edu.hk" },
] as const;

const HKBU_PUBLIC_EXCHANGE_COURSE_GROUPS = [
  {
    department: "Faculty of Arts and Social Sciences (CHRP)",
    courses: `
CHIL2016|Chinese Etymology
CHIL2017|Classical Chinese
CHIL2025|History of Classical Chinese Literature (Song to Qing Dynasties)
CHIL3015|Selected Chinese Lyrics and Songs
CHIL3026|Modern Chinese Fiction Writing
CHIL4005|Literary Criticism
CHIL4026|Modern Views on Traditional Chinese Culture
CHIL4027|Selected Readings from Classical Confucian Works
CHIL4035|Selected Readings from Traditional Chinese Thinkers (Zi)
CHIL4057|Special Topics in Chinese Language
CHIL4106|Special Topics in the History of Chinese Literature (Modern Literature)
GCAP3006|Implementation of Service-learning Engagement through Chinese Story Telling and Writing
GCAP3007|A Tale of Two Cities
GCAP3015|Ecotourism in GBA (Guangdong-Hong Kong-Macao Greater Bay Area): Planning and Design
GCAP3016|Historic Landmarks, Heritage and Community
GCAP3085|Bringing Chinese Culture into the Community through Art Activities
GFCC1037|The Individual and Society
GFCC1045|Hong Kong between Past and Present
GFCC1046|An Introduction to Gender, Class and Race
GFCC1055|Global China in the Modern Age
GFHC1037|The Individual and Society
GFHC1045|Hong Kong between Past and Present
GFHC1046|An Introduction to Gender, Class and Race
GFHC1055|Global China in the Modern Age
GFVM1035|Freedom in Modern Society
GFVM1036|Happiness: East and West
GFVM1037|Ideologies, Worldviews and Modern History
GFVM1045|Matters of Life and Death
GFVM1046|The Meaning of Love, Sex and the Body
GFVM1057|Ethical Issues in the Contemporary World
GTCU2006|Chinese Knight-errant Heroism and the Modern World
GTCU2015|Creativity and Madness
GTCU2056|Adventures, Treasures, and Archaeology in China
GTCU2066|Film and Philosophy
GTCU2067|Striving for Sustainable Peace through Cultural Activities and Creative Arts
GTCU2075|Thinking Creatively through Chinese Philosophy
GTSC2006|Becoming Critically Thoughtful Cyberworld Citizens
GTSC2015|Disease and Public Health in China since 1800
GTSC2077|Are Science and Religion Compatible?
GTSC2086|Social Change and Technological Progress
HIST1105|China in the Imperial Age
HIST3106|Current Issues in Hong Kong and China
HIST3116|Foreign Relations of Modern China
HIST3136|Intangible Cultural Heritage in Hong Kong and South China
HIST3206|History of Southeast Asia
HIST3225|Europe since the First World War
HIST3227|Modern History of Singapore
HIST3306|International Relations After 1945
HIST3315|Modern Japan and the West
HIST3405|Historical Theory and Practice
HIST3406|Information Technologies and Quantitative Methods for Historical Studies
HIST4105|History of Chinese Women since 1912
HIST4317|Global History of Tourism
HIST4406|Topic Studies in Cultural History
RELI1005|Quest for Truth and Meaning
RELI2027|Introduction to Chinese Philosophy and Religion
RELI2035|Introduction to Ethics
RELI2036|Social Scientific Study of Religion
RELI3026|Christianity, Humanism & the Contemporary World
RELI3065|History of Modern Western Philosophy
RELI3077|Religion and Social Movements
RELI3106|Religion and Modern Chinese Societies
RELI3107|Chinese Moral and Political Philosophy
RELI3115|Theological Ethics
RELI3126|Theology, Liberalism and Sex in Chinese Societies
RELI3235|AI and Good Life: Global Perspectives
RELI4015|Mysticism and Religious Experience
RELI4016|Selected Topics/ Readings in Philosophical Studies
RELI4046|Selected Topics/Readings in Religious Studies
`.trim(),
  },
  {
    department: "Digital Futures and Humanities",
    courses: `
DIFH1005|AI and Digital Futures in the Humanities
`.trim(),
  },
  {
    department: "Faculty of Arts and Social Sciences",
    courses: `
GCAP3145|Community and Civic Engagement
GCAP3146|Global Outreach
GEND3005|Gender, Society, Culture
SOSC1005|Internship I
SOSC2005|Internship II
SOSC3005|Community and Civic Engagement
SOSC3006|Global Outreach
`.trim(),
  },
  {
    department: "Academy of Global China Studies",
    courses: `
GCAP3066|Global Beijing: Society, Culture and Changes
GCST1005|Approaches in Global Studies
GCST2006|A Political Economy of Global China
GCST2015|Cultural Heritage and Chinese Society
GCST3007|Research and Professional Writing
GCST4005|Alternative Globalisations
`.trim(),
  },
  {
    department: "Department of Government and International Studies",
    courses: `
EURO2007|The Political Economy of the European Union
EURO2015|Model European Union
EURO4005|Current Issues of European Integration
EURO4006|European Economic and Business Life: travailler en contexte international
EURO4007|European Economic and Business Life: Wirtschaft im Wandel/Deutsch-chinesische Wirtschaftsbeziehungen
FREN1205|European Language in Context I (French)
FREN2209|European Language in Context II (French)
GCAP3157|Leisure and Well-Being: Coping with Stress
GCAP3195|Hong Kong and the World
GEOG2007|Introduction to Quantitative Methods in Geography
GEOG2015|Maps and Map Making
GEOG2016|Earth Systems: Atmosphere and Biosphere
GEOG2017|Globalization of Economic Activities
GEOG2025|The Guangdong-Hong Kong-Macao Greater Bay Area: A Geographical Survey
GEOG2026|Introduction to Smart and Sustainable Cities
GEOG3006|Regional Geography of China
GEOG3016|Geography of Pacific Area: Regional development and Geopolitics
GEOG3017|Global Environmental Issues and Sustainability
GEOG4005|Advanced Climatology
GEOG4016|Sustainable Energy and Technological Innovation in China
GEOG4017|Geographical Information Systems
GEOG4027|Geography of Environmental Hazards
GEOG4035|Geography of Transportation
GEOG4036|Political Geography
GEOG4065|Energy Policy and Analysis
GEOG4066|Seminar in Environmental Planning and Management
GEOG4076|Urban Cultural Landscape
GEOG4086|Urban and Environmental Planning
GEOG4096|Biogeography
GEOG4097|Ecosystems and Processes
GERM1205|European Language in Context I (German)
GERM2209|European Language in Context II (German)
GFCC1057|Building a Global Community: International Law and Politics since 1945
GFHC1057|Building a Global Community: International Law and Politics since 1945
GFHL1076|Health through Balance: Achieving Physical, Social and Emotional Wellbeing
GSIS2005|Statistics for the Social Sciences
GTSU2026|Sustainable Peace: Conflict-Resolution and Reconciliation of Divided Communities
GTSU2036|Ethics, Governance, and Public Policy
GTSU2056|People and the Environment
POLS1005|Foundations of Political Science
POLS2015|Government and Politics of Hong Kong
POLS2016|Social Movements and Contentious Politics
POLS2025|Foundations of Political Philosophy
POLS2026|Ethics, Social Well-being, and Public Health
POLS3006|Statistical and Survey Methods for Political Science
POLS3017|Government and Politics of China
POLS3225|Religion and Politics
POLS3236|Gender and Politics
POLS4226|Public Policy and Governance
POLS4247|Comparative Electoral and Party Politics
SOCI1005|Invitation to Sociology
SOCI2005|Qualitative Methods of Social Research
SOCI2006|Social Statistics
SOCI2007|Quantitative Methods of Social Research
SOCI2015|Classical Social Theory
SOCI2017|Popular Culture and Society
SOCI2035|Social Inequalities
SOCI3017|Health and Society
SOCI3045|China and Tourism
SOCI3047|Sociology of Consumption
SOCI3057|Leisure and Well-being: Coping with Stress
SOCI3065|Quantitative Methods of Social Research
SOCI4006|Chinese Family and Kinship
SOCI4016|Globalization
SOCI4017|Management, Organization and Society
SOCI4026|Selected Topics in Contemporary Sociology I
SOCI4035|Selected Topics in the Sociology of China I
SOCI4037|Cultural Sociology
UCHL1076|Health through Balance: Achieving Physical, Social and Emotional Wellbeing
`.trim(),
  },
  {
    department: "Faculty of Arts and Social Sciences (LAC)",
    courses: `
ENGL1005|English, Creativity, and Cultures
ENGL2016|Sounds of English around the World
ENGL2017|Stepping Stones in English Grammar
ENGL2025|The Art of Storytelling
ENGL2027|Academic and Professional Writing
ENGL2097|Virtual Storytelling: Narration across Dimensions
ENGL3026|Special Topic in Language
ENGL3055|Literature and Film
ENGL3066|Modern and Contemporary Drama
ENGL3205|Components of a Word
ENGL3405|Shakespeare as Dramatist
ENGL4006|Advanced Topic in Language
ENGL4007|Advanced Topic in Linguistic Theory
ENGL4027|Exploring Bilingualism and Bilingual Education
ENGL4066|World Literatures
ENGL4067|Comics and Graphic Novels
ENGL4127|Introducing African Literatures
HUMN1006|Introduction to the Humanities
HUMN2006|Human Self-Discovery
HUMN2025|Gender: Theory and Culture
HUMN2026|Globalization and Culture
HUMN3006|Great Works in the Humanities
HUMN3007|Language and the Humanities
HUMN3015|The Making of the Contemporary World
HUMN3016|Professional Writing Practicum: Essentials of the Craft of Writing
HUMN4025|Cultural Studies
HUMN4027|The Double Face of Creativity: Fact and Fiction
HUMN4037|Special Topic in Arts and Creativity
TRAN1005|Introduction to Translation
TRAN2006|Linguistics for Translators
TRAN2035|Translation, Museums and Intercultural Representation
TRAN3055|Interpreting Technology
TRAN3066|Video Game Localization
TRAN4005|Theories and Philosophies I
TRAN4037|Translation and Intercultural Studies
TRAN4047|Translation Workshop
TRAN4075|Machine Learning, Artificial Intelligence and Translation
WRIT1005|Creativity: Theory & Practice
WRIT2005|Biography Writing
WRIT2006|Food, Wine and Travel Writing for the Leisure Industry
WRIT2007|Editing and Publishing
WRIT3005|Reading Masterpieces and Writing Your Own
WRIT3006|Professional Writing Practicum: Essentials of the Craft of Writing
WRIT3015|Scriptwriting for Theatre
WRIT3025|Big Stories: Writing Long-form Fictional Narratives
WRIT4006|Writing Internship
WRIT4015|The Double Face of Creativity: Fact and Fiction
WRIT4016|Writing Diaspora in a Global World
`.trim(),
  },
  {
    department: "Whole Person Development",
    courses: `
GCAP3186|Service Leadership in Learning Communities
GCAP3187|Connecting the Elderly with the Internet - E-sports
GFHL1016|CrossFit: Cross-bridge of Fitness and Health
GFHL1025|Have a Field Day: Outdoor Team Games
GFHL1026|Home-Based Exercises: A Family Experience
GFHL1027|Mind and Body Exercises: Stretching and Pilates
GFHL1036|Table Tennis: A Brainy Workout
GFHL1037|Hand-eye Rally: Tennis, Taspony and Pickleball
GFHL1045|When Traditional Tai Chi Meets Modern Health and Fitness
GFHL1046|Whip it or Spin it: Badminton and Flyball
GFHL1047|Healthy Lifestyle in Action
GFHL1066|Improving Mental Health for University Success
GTSU2047|Walkability of a City
PERM1006|Human Anatomy and Physiology
PERM1015|History and Philosophy of Physical Education, Sport and Recreation
PERM3006|Research Methods
PERM3025|Kinesiology
PERM3026|Nutrition and Health
PERM3046|Theory and Practice in Sport and Recreation Management
PERM3065|Sports Performance and Health: The Marvel of Science, Technology, and Psychology
PERM4005|Facility Management
PERM4007|Leadership and Communication in Sport and Recreation
PSYC1005|Principles of Psychology
PSYC2006|Developmental Psychology
PSYC2007|Psychology of Personality
PSYC3005|Abnormal Psychology
PSYC3007|Cognitive Psychology
SOWK1005|Social Work in Contemporary Society
SOWK1006|Human Development through the Life Span
SOWK1015|Social Dimensions of Human Societies
SOWK2006|Social Work Intervention and Processes
SOWK2029|Social Policy
SOWK3006|Law and Society
SOWK3019|Social Work Research
SOWK3029|Theory and Practice in Social Work: Community Development
SOWK3039|Theory and Practice in Social Work: Group
SOWK3049|Theory and Practice in Social Work: Individual
SOWK3205|Love and Human Sexuality
SOWK4005|Administration in Human Service Organizations
SOWK4206|Social Work with Older People
SOWK4215|Social Work with Youth
UCHL1016|CrossFit: Cross-bridge of Fitness and Health
UCHL1025|Have a Field Day: Outdoor Team Games
UCHL1026|Home-Based Exercises: A Family Experience
UCHL1027|Mind and Body Exercises: Stretching and Pilates
UCHL1036|Table Tennis: A Brainy Workout
UCHL1037|Hand-eye Rally: Tennis, Taspony and Pickleball
UCHL1045|When Traditional Tai Chi Meets Modern Health and Fitness
UCHL1046|Whip it or Spin it: Badminton and Flyball
UCHL1047|Healthy Lifestyle in Action
UCHL1066|Improving Mental Health for University Success
`.trim(),
  },
  {
    department: "Department of Accountancy, Economics and Finance",
    courses: `
ACCT1006|Principles of Accounting II
ACCT2005|Intermediate Accounting I
ACCT2006|Intermediate Accounting II
ACCT3006|Hong Kong Taxation
ACCT3007|Cost and Management Accounting II
ACCT3026|Accounting Internship I
ACCT3045|Accounting Internship II
ACCT4017|Auditing II
ACCT4035|Big Data in Accounting with Power BI
BUSI1006|Business Research Methods
BUSI2045|Data Analytics for Business Decision Making
BUSI3097|Data Analytics for Business Decision Making
ECON1006|Principles of Economics II
ECON1007|Basic Economic Principles
ECON3006|Asia-Pacific Economies
ECON3007|Industrial Organization and Competitive Strategy
ECON3077|Managerial Macroeconomics
ECON3086|Python Programming for FinTech
ECON3087|Understanding the Digital Economy
ECON3105|Big Data Analytics with Python
ECON3107|Environmental Cost and Benefit Analysis
FINE1005|Financial Planning and Investment Analysis
FINE2005|Financial Management
FINE2006|Banking and Credit
FINE3005|Investment Management
FINE3006|Introduction to Futures and Options Markets
FINE3007|Fixed Income Securities
FINE3015|Corporate Finance
FINE3026|Finance Internship
FINE3035|ESG, Green Finance and Sustainable Investment
FINE4006|Financial Risk Management
FINE4025|Compliance in Finance
FINE4026|FinTech for Banking and Finance
FINE4027|Mergers, Acquisitions and Corporate Restructuring
GCAP3037|How Should the Government Spend Our Money
GCAP3076|Service-learning in Fighting Poverty
GCAP3267|Professional Investment Lab: Experiential Portfolio Management
GFCC1036|The Rise of China: Historical Institutions and Modern Global Governance
GFHC1036|The Rise of China: Historical Institutions and Modern Global Governance
GFQR1046|Demystifying Data-Driven Strategies and Policies
GFVM1055|Towards a Moral Economy
GTSC2007|Cyberspace and the Law: Your Rights and Duties
GTSC2026|How Technology Shakes Up Our Society
GTSC2087|Building the Cities of Tomorrow: Smart Cities and Property Technology
GTSU2007|Fighting Poverty and Striving for a Sustainable Society
GTSU2017|Law and Humanities
GTSU2027|Tax: Answer for Wealth Inequality
GTSU2046|Towards Evidence-Based Solutions to Our Social-ecological Problems
GTSU2055|To Fear or Not To Fear: The Coming of AI and What It Means for Our Communities
GTSU2067|Uplifting Communities with Financial Literacy
LLAW3007|Principles of Law
`.trim(),
  },
  {
    department: "Department of Management, Marketing and Information Systems",
    courses: `
BUSI1005|The World of Business and Entrepreneurship
BUSI1007|Business Coding
BUSI2005|Organisational Behaviour
BUSI2035|Entrepreneurship and Innovative Thinking
BUSI2055|AI for Business
BUSI3006|Business Ethics, CSR and Impact Investing
BUSI3035|Service Learning and Community Engagement
BUSI3046|Business Communications in the Technology Era
BUSI3055|Fundamentals of Social Entrepreneurship and Social Impact
BUSI3057|Managing Entrepreneurial Ventures
BUSI3095|Project Management for Digital Initiatives
BUSI4006|Strategic Management
BUSI4036|Data-driven DEI
GCAP3077|Entrepreneurial and Innovative Solutions to Social Problems
GCAP3087|Canine Service Partners for Inclusive Community
GCAP3235|AI and Digital Inclusion in an Ageing Society
GCAP3257|Human Capital Sustainability: Leadership for a Better Future
GFCC1065|Reinventing and Marketing Yourself
GFVM1056|Evil Business? Psychology, Politics and Philosophy of Business Ethics
GTCU2036|Social Innovation and Entrepreneurship
GTSC2047|When Science Fiction Comes True: The Future of Humanity
GTSU2037|Sustainability through Digitalization: Active and Responsible Citizens in the Digital World
HRMN3007|Applied Social Psychology in Organisations
HRMN3025|Occupational Health and Employee Wellness
HRMN3027|Human Resources Management Mentoring
HRMN4005|Performance Appraisal and Rewards
HRMN4006|Employment Law and Practices
ISEM2005|Management Information Systems
ISEM2006|Programming for Business Applications using Python
ISEM3005|Business Systems Analysis and Design
ISEM3027|Introduction to App Development and Mobile User Experience Design
ISEM4017|Consumer Insight: Online Customer Data Analytics and Machine Learning Approaches
ISEM4025|Information Systems Auditing
ISEM4035|Blockchain: Cryptocurrencies and Other Business Applications
MKTG2005|Marketing Management
MKTG3005|Marketing Research Methods
MKTG3006|Global Marketing
MKTG3007|Consumer Behaviour
MKTG3015|Socially Responsible Marketing
MKTG3017|Services Marketing
MKTG3025|Integrated Marketing Communications
MKTG3026|Strategic Digital Marketing
MKTG3047|Big Data Marketing
MKTG3056|Social Media Marketing
MKTG3057|Seminar in MarTech and Business Intelligence
MKTG4005|Strategic Marketing
MKTG4057|Agribusiness: Marketing and Entrepreneurship
REMT3006|Smart Retailing
`.trim(),
  },
  {
    department: "School of Chinese Medicine",
    courses: `
BMSC1007|Physiology
BMSC1015|Biochemistry and Molecular Biology
BMSC2017|Pharmacology
CMED2017|Chinese Medicinal Formulae
CMED2025|Selected Readings of Chinese Medicine Classics (II) - Treatise on Exogenous Febrile Diseases
CMED2027|Selected Readings of Chinese Medicine Classics (IV) - Science of Seasonal Febrile Diseases
CMED3035|Surgery of Chinese Medicine
CMED3039|Internal Medicine of Chinese Medicine II
CMED3057|Paediatrics of Chinese Medicine
GFHL1056|Practice of Health Preservation and Management in Traditional Chinese Medicine
GTSC2025|Health Maintenance and Food Therapy in Chinese Medicine
GTSC2065|Diseases and Medicine
PCMD1027|Medicinal Botany II
PCMD1055|Organic Chemistry II
PCMD1065|Molecular Biology and Biochemistry
PCMD1067|Anatomy and Physiology
PCMD2005|Chinese Medicinal Formulae
PCMD2006|Phytochemistry
PCMD2037|Resources of Chinese Medicinal Plants
PCMD3025|Biopharmaceutics
PCMD4036|Licensing Training for Pharmacist in Chinese Medicines
UCHL1056|Practice of Health Preservation and Management in Traditional Chinese Medicine
`.trim(),
  },
  {
    department: "Department of Communication Studies",
    courses: `
COMM1015|Studies in Communication, Media, and Journalism
COMM2006|Communication Theory (Communication Studies)
COMM2026|Human Communication
GCAP3115|Children as Consumers: Marketing to the Youth
GCAP3227|Connected Communities: Communication Technologies for Social Impact
GFHL1075|Communicating Health and Healthy Lifestyle
PRAO2005|Introduction to Public Relations and Advertising
PRAO2007|Principles and Practices of Advertising
PRAO2015|Principles and Practices of Public Relations
PRAO2037|Interpersonal Communication
PRAO2047|Media Design for Corporate Communication
PRAO3005|Content Creation in Advertising
PRAO3007|Advertising Design and Visualization
PRAO3015|Consumer Perspectives in Public Relations and Advertising
PRAO3017|Digital Public Relations
PRAO3027|Digital Audio and Video Production
PRAO3035|Public Relations Writing
PRAO3046|Audience Measurement and Engagement
PRAO3056|Campaign Planning and Management
PRAO3067|Health Communication and Information Campaigns
PRAO3085|Social Media @ Work
PRAO4016|Strategic Issues and Crisis Management
PRAO4025|Brand Strategy and Communication
PRAO4036|Social Communication and Advertising
PRAO4056|Creative Brand Expression
PRAO4057|Organizational Decision Making and Problem Solving
PRAO4065|Advanced Quantitative Communication Research
UCHL1075|Communicating Health and Healthy Lifestyle
`.trim(),
  },
  {
    department: "Department of Interactive Media",
    courses: `
GAME1005|Fundamentals of Animation for Game Design and Film
GAME2006|Fundamentals of Programming for Game Design and Animation
GAME2017|Transcultural Studies of Animation
GAME2025|Visual Communication
GAME3027|Traditional and Experimental Animation
GAME4006|3D Game World Programming
GAME4015|Game Physics, Dynamics, and Simulations
GAME4016|Lighting, Rendering and Style
GAME4017|Motion Graphic Design
GAME4026|Creative Production in Extended Reality
GAME4036|Game Economy: Cryptocurrency and Blockchain Technology
GCAP3265|Entrepreneurial Innovation for Interactive Media
IMPP3005|Innovations in Publishing: Exploring Emerging Media and Technologies
IMPP3015|Strategic Message Design
`.trim(),
  },
  {
    department: "Department of Journalism",
    courses: `
COMM2027|AI and Digital Communication
COMM2036|Media Design and Digital Applications
GCAP3126|Fact-checking Misinformation and Disinformation
GCAP3127|Media Communication in the AI Era
JOUR2085|English News Reporting and Writing
JOUR2087|Multimedia and Multiplatform Journalism with AI Applications
JOUR2116|Finance and Economics for Journalists
JOUR2117|Broadcast Reporting and Production with AI Tools
JOUR2126|Data Journalism
JOUR3016|Political Economy for Journalists
JOUR3137|Journalism and Communication Theory
JOUR3145|Investigative Reporting (Chinese)
JOUR3157|Journalism in the Age of AI: Law and Ethics
JOUR3186|Generative AI- Assisted Reporting
JOUR3255|Journalism Practicum I (English)
JOUR3285|Financial Data and Market Sentiment Analysis
JOUR3287|Social Media Content Management
JOUR4045|Entrepreneurial Journalism
JOUR4056|Media Management
JOUR4057|International News in a Globalized World
JOUR4065|Strategic Investments and Contemporary Economics
JOUR4066|News Documentary
JOUR4075|Morally Controversial Issues in the Media
`.trim(),
  },
  {
    department: "Academy of Film",
    courses: `
FAGS2005|Voice and Speech II
FAGS2006|Movement II
FAGS2025|Dance for Actors
FAGS2026|Special Topic in Screen Performance
FAGS2027|Special Topic in Acting: Asia Focus
FAGS2035|World Theatre
FAGS2036|Performativity & Online Content Creation
FAGS3025|Technology, Body and Performance
FAGS3026|My Acting Career
FAGS3027|Global Studies in Acting
FAGS4005|Casting, Film Festival & Acting as a Business
FILM2007|Photography
FILM2047|Storytelling
FILM2067|The Art of Script Writing
FILM2086|Digital Advertising Production
FILM2087|Ideologies, Gender and Cinema
FILM3006|Film Sound
FILM3016|Non-Fiction Film
FILM3027|Television Studio Production
FILM3035|Chinese-Language Cinema
FILM3047|Hollywood Cinema
FILM3076|Screen Acting Workshop
FILM3077|The Art of Documentary Film
FILM3147|Entertainment 3.0: Creative Industries and Technology
FILM4026|East Asian Cinemas: History and Current Issues
FILM4046|Advanced Cinematography
FILM4047|Film Theory and Criticism
FILM4065|Art Direction
GFCC1066|Youth on Screen: Coming-of-Age Stories in Global Cinema
`.trim(),
  },
  {
    department: "Academy of Music",
    courses: `
GCAP3105|Meditation and Music for Wellbeing and Goal Achievement
MUSI2045|Introduction to Music Education
MUSI2065|Happiness and Flourishing: The Science and Practice
MUSI3046|Western Music History Topic I
MUSI3047|Western Music History Topic II
MUSI3145|Music and AI
MUSI4006|School Music Education: Hong Kong and Beyond II
MUSI4026|Special Topics in Music II
MUSI4027|Special Topics in Music III
MUSI4037|Special Topics in Music and Technology II
`.trim(),
  },
  {
    department: "School of Creative Arts",
    courses: `
ARTT1006|Arts Tech Practices I (Making Senses)
ARTT2006|Arts Tech Practices II (Transmedia Beyond Spectacles)
ARTT3006|Transdisciplinary Collaboration II
ARTT3007|Arts Tech Work Experience
ARTT4007|Arts Tech - Special Topics
BAGE3015|Transdisciplinary Collaboration II
CRIN3005|Special Topics on Creative Industry I
`.trim(),
  },
  {
    department: "Academy of Visual Arts",
    courses: `
GCAP3215|Art and the Community
GFHL1057|The Art of Mindfulness
GTCU2005|Art, Culture and Creativity
GTCU2046|The Synergy of Chinese Arts and Literature as Self-Expression
GTSC2045|Seeing the World from Artistic and Scientific Perspectives
UCHL1057|The Art of Mindfulness
VART1306|Arts and Its Histories II
VART2635|Drawing on Location and Collage
VART2637|Painting Materials and Methods from Observation
VART2645|Chinese Calligraphy
VART2646|Chinese Seal Engraving
VART2647|Chinese Gongbi Painting
VART2655|Chinese Landscape Painting
VART2656|Analogue Photography
VART2657|Digital Photography
VART2666|Sound Basics and Sound Editing
VART2667|Video Editing
VART2686|Moving Narratives
VART2687|Illustration
VART2697|Screenprinting
VART2706|Glass Blowing
VART2715|Fundamental Hand-building and Wheel-throwing Techniques for Ceramics
VART2717|Small Metal Jewellery
VART2725|Wearables
VART2726|3D Software Fundamentals and Prototyping
VART2737|Digital Modelling and Fabrication for Sculpture
VART2745|Abstract Painting
VART3377|Studio: Drawing and Painting
VART3385|Studio: Chinese Arts
VART3386|Studio: Audio-Visual Practices in Media Arts
VART3387|Studio: Sculpture
VART3395|Studio: Graphic Design
VART3397|Studio: Object Culture
VART3427|Studio: Ceramics
VART3437|Studio: Printmaking
VART3445|Studio: Object Technology (Robotics and Kinetics)
VART3455|Image Processing in Arts and Technology
VART4126|Special Topics in Visual Arts Studies (Curatorial Practice)
`.trim(),
  },
  {
    department: "Department of Biology",
    courses: `
BIOL1005|Introduction to Biology
BIOL2015|Biodiversity
BIOL2017|Cell Biology
BIOL2026|Genetics and Evolution
BIOL3005|Animal Physiology
BIOL3016|Environmental Health and Toxicology
BIOL3025|Plant Physiology
BIOL3027|Waste Treatment and Recycling
BIOL3056|Introduction to Genome Biology
BIOL3065|Soil Science and Fertility
BIOL3067|Crop Production and Management
BIOL4017|Environmental Biotechnology
BIOL4027|Developmental Biology
BIOL4046|Neurobiology
BIOL4047|Farm Management for Urban Environment
BIOL4067|Sustainable Urban Environment
`.trim(),
  },
  {
    department: "Department of Chemistry",
    courses: `
CHEM1005|Introduction to Chemistry
CHEM2006|Integrated Chemistry Tutorials I
CHEM2007|Integrated Chemistry Tutorials II
CHEM2066|Analytical Chemistry
CHEM2067|Organic Chemistry I
CHEM3015|Inorganic Chemistry
CHEM3036|Biochemistry I
CHEM3047|Chemistry Research Methods
CHEM3056|Integrated Chemistry Tutorials IV
CHEM4017|Environmental Chemistry and Analysis
CHEM4025|Advanced Instrumental Analysis
CHEM4045|Organic Synthesis
CHEM4057|Spectroscopic Techniques for Structure Determination
CHEM4076|Chemical Testing Laboratory Management and Accreditation
CHEM4086|Forensic Chemistry and Analysis
GTSC2036|Science, Culture, and Society
`.trim(),
  },
  {
    department: "Department of Computer Science",
    courses: `
COMP1005|Essence of Computing
COMP1025|Coding for Humanists
COMP2015|Data Structures and Algorithms
COMP2016|Database Management
COMP2017|Operating Systems
COMP2035|AI and Data Analytics for Health and Social Innovation I
COMP3065|Artificial Intelligence Application Development
COMP3066|Health and Assistive Technology: Practicum
COMP3076|AI and Generative Arts
COMP3115|Exploratory Data Analysis and Visualization
COMP4025|Interactive Computer Graphics
COMP4026|Computer Vision and Pattern Recognition
COMP4027|Data Mining and Knowledge Discovery
COMP4046|Information Systems Control and Auditing
COMP4057|Distributed and Cloud Computing
COMP4107|Software Design, Development and Testing
COMP4117|Information Systems: Design and Integration
COMP4127|Information Security
ITEC3015|Web Development for Data Storytellers
UCHL1065|E-sports and Health
`.trim(),
  },
  {
    department: "Department of Mathematics",
    courses: `
GCAP3225|Essential Mathematics to Understand Modern Digital World
GCAP3226|Empowering Citizens through Data: Participatory Policy Analysis for Hong Kong
GFHL1077|Understanding Numbers, Improving Health
GFQR1045|Making a Smart Decision
GFQR1055|Sharpening Your Number Sense with Handy Computational Tools
GFQR1056|Be a Smart Financial Planner
GFQR1057|How to Survive in the World of Misinformation
GTSC2027|Mathematics on the Battlefields
GTSC2076|Soccer beyond the Pitch: Intersecting Data, History, Culture and Society
MATH1005|Calculus I
MATH1025|Understanding Mathematics and Statistics
MATH2006|Calculus, Probability, and Statistics for Science
MATH2207|Linear Algebra I
MATH2215|Mathematical Analysis
MATH2216|Statistical Methods and Theory
MATH2225|Calculus II
MATH3205|Operations Research I
MATH3407|Linear Algebra II
MATH3606|Differential Equations II
MATH3616|Scientific Computing II
MATH3806|Multivariate Statistical Methods
MATH3845|Interest Theory and Applications
MATH4225|Foundation of Big Data and Learning
MATH4615|Numerical Linear Algebra
MATH4665|Special Topics in Applied Mathematics I
MATH4816|Optimization Theory and Techniques
MATH4826|Time Series and Forecasting
UCHL1077|Understanding Numbers, Improving Health
`.trim(),
  },
  {
    department: "Department of Physics",
    courses: `
GCAP3255|Sustainable Lifestyles: Energy Management and Green Mobility
GEST1005|Introduction to Green Energy and Smart Technology
GEST2006|Energy Foundation II: Electricity and Magnetism
GEST2015|Energy Storage and Distribution
GEST3006|Digital Technology for Network Communication
GEST3007|Sustainable Transportation Technology
GEST3027|Principles of AI: from Model to Applications
GEST4006|Energy Management of Green Building
GEST4015|Advances in Displays and Lighting
GEST4016|Topics in Green Energy and Smart Technology I
GEST4027|Introduction to Robotics
GFHL1085|Smart Devices for Personal Healthcare
GTSC2005|Astronomy for the 21st Century
GTSC2016|Entrepreneurship in the Innovation Era
GTSU2015|Green Energy Innovation for Sustainable City
UCHL1085|Smart Devices for Personal Healthcare
`.trim(),
  },
  {
    department: "Institute of Transdisciplinary Studies (Undergraduate)",
    courses: `
ITS 2005|Transdisciplinary Inquiries and Methodologies
ITS 2019|Transdisciplinary Problem Solving II
ITS 2029|Global Challenges II
`.trim(),
  },
  {
    department: "Language Centre",
    courses: `
FREN1005|French I
FREN1006|French II
FREN2006|French IV
FREN3006|Contemporary French Society through its National Cinema
GCAP3056|Taking a Stand: Turning Research Insights into Policy Recommendations
GERM1005|German I
GERM1006|German II
GERM2006|German IV
GERM3007|German Language, Culture and Society
GERM3016|Cinematic Germany: Analyzing History, Culture and Social Issues through Postmodern German Films
GTCU2016|English in the World Today
GTCU2025|Gender, Language, and Creativity
JPSE1005|Japanese I
JPSE1006|Japanese II
JPSE1007|Exploring Japanese Language, Culture and Society
JPSE2006|Japanese IV
JPSE3006|Business Japanese
JPSE3007|Japanese VI
LANG0036|Enhancing English through Global Citizenship
LANG1005|Elementary Putonghua
LANG1006|Intermediate Putonghua
LANG1015|Creative Writing in Chinese
LANG1026|Practical Putonghua
LANG1035|Foundation Cantonese I
LANG1036|Foundation Cantonese II
LANG1045|Engaging Communication Activities and Language Teaching for Service-Learning Abroad
LANG1105|Introductory Mandarin for Non-Chinese Speakers (Part I)
LANG1106|Introductory Mandarin for Non-Chinese Speakers (Part II)
LANG1107|Introductory Cantonese for Non-Chinese Speakers
LANG2005|Creative Writing Through Masterpieces
LANG2016|Interpersonal Putonghua
LANG2027|Applied Cantonese II
LANG2045|Language Online: Unearthing Controversial Narratives on the Web
LANG2046|Comprehension of Modern Spoken English: Culture and Context
LANG2056|Putonghua Public Speaking
LANG2065|Chinese Language Application and Culture in Hong Kong
LANG2075|Hong Kong Literature Workshop
LANG3007|Modern and Contemporary Theatre: Appreciation and Playwriting
SPAN1005|Spanish I
SPAN1006|Spanish II
SPAN2006|Spanish IV
SPAN3006|Spanish Language, Culture and Society
UCLC1005|University Chinese
UCLC1008|University English I
UCLC1009|University English II
UCLC1015|Chinese I
UCLC1016|University Chinese (Syllabus B)
UCLC1017|Chinese II
UCPN1005|The Art of Persuasion
`.trim(),
  },
] as const;

const HKBU_COURSE_SEED_FIXTURES = HKBU_PUBLIC_EXCHANGE_COURSE_GROUPS.flatMap((group) =>
  group.courses
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, name = ""] = line.split("|");
      const normalizedCode = code.trim();
      return {
        id: `courseHKBU${normalizedCode.replace(/\s+/g, "")}`,
        code: normalizedCode,
        name: name.trim(),
        department: group.department,
      };
    })
);

const HKBU_CANTEEN_SEED_FIXTURES = [
  {
    id: "canteen-hkbu-harmony-cafeteria",
    name: "Harmony Cafeteria",
    department: "Level 4, Sir Run Run Shaw Building",
    location: "Ho Sin Hang Campus",
  },
  {
    id: "canteen-hkbu-harmony-lounge",
    name: "Harmony Lounge",
    department: "Level 4, Sir Run Run Shaw Building",
    location: "Ho Sin Hang Campus",
  },
  {
    id: "canteen-hkbu-main-canteen",
    name: "Main Canteen",
    department: "Level 5, Academic and Administration Building",
    location: "Baptist University Road Campus",
  },
  {
    id: "canteen-hkbu-bistro-ntt",
    name: "Bistro NTT",
    department: "G/F, Dr. Ng Tor Tai International House",
    location: "Baptist University Road Campus",
  },
  {
    id: "canteen-hkbu-books-n-bites",
    name: "Books n' Bites",
    department: "G/F, Jockey Club Academic Community Centre",
    location: "Baptist University Road Campus",
  },
  {
    id: "canteen-hkbu-icafe",
    name: "iCafe",
    department: "Level 3, The Wing Lung Bank Building for Business Studies",
    location: "Shaw Campus",
  },
  {
    id: "canteen-hkbu-nan-yuan",
    name: "Nan Yuan",
    department: "Level 2, David C. Lam Building",
    location: "Shaw Campus",
  },
  {
    id: "canteen-hkbu-hfc-scholars-court",
    name: "H.F.C.@Scholars Court",
    department: "Level 2, David C. Lam Building",
    location: "Shaw Campus",
  },
  {
    id: "canteen-hkbu-jccc-ug-cafe",
    name: "JCCC UG/F Cafe",
    department: "Upper Ground Floor, Jockey Club Campus of Creativity",
    location: "Jockey Club Campus of Creativity",
  },
  {
    id: "canteen-hkbu-jccc-g-cafe",
    name: "JCCC G/F Cafe",
    department: "Ground Floor, Jockey Club Campus of Creativity",
    location: "Jockey Club Campus of Creativity",
  },
  {
    id: "canteen-hkbu-cafe-cva-commons",
    name: "Cafe@CVA Commons",
    department: "G/F, Communication and Visual Arts Building",
    location: "Ho Sin Hang Campus",
  },
  {
    id: "canteen-hkbu-bu-fiesta",
    name: "BU Fiesta",
    department: "G/F, Kai Tak Campus",
    location: "Kai Tak Campus",
  },
  {
    id: "canteen-hkbu-deli",
    name: "Deli",
    department: "G/F, Kai Tak Campus",
    location: "Kai Tak Campus",
  },
];

function parseCategory(input: string): RatingCategory {
  const normalized = (input ?? "").trim().toUpperCase();
  if (!Object.values(RatingCategory).includes(normalized as RatingCategory)) {
    throw new ValidationError("Unsupported rating category");
  }
  return normalized as RatingCategory;
}

function sanitizeText(value: string | null | undefined, fallback = ""): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function parseScoreRecord(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(numeric)) {
      result[key] = Math.max(0, Math.min(5, numeric));
    }
  }
  return result;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return roundToTwo(Math.sqrt(variance));
}

let _seedDataInitialized = false;
let _seedDataInitializationPromise: Promise<void> | null = null;

// Bump this version when DIMENSION_FIXTURES or seed data changes
const SEED_VERSION = "v7";

export async function ensureRatingSeedData() {
  if (_seedDataInitialized) return;
  if (_seedDataInitializationPromise) {
    await _seedDataInitializationPromise;
    return;
  }

  _seedDataInitializationPromise = (async () => {
    // Check Redis flag first (safe across serverless instances)
    try {
      const done = await redis.get("rating:seed:done");
      if (done === SEED_VERSION) {
        _seedDataInitialized = true;
        return;
      }
    } catch {
      // Redis down — fall through to seed check
    }
    // Clean up old dimensions that are no longer in DIMENSION_FIXTURES
    const validDimensionKeys = Object.entries(DIMENSION_FIXTURES).flatMap(([category, dimensions]) =>
      dimensions.map((d) => ({ category: category as RatingCategory, name: d.key }))
    );
    const allCategories = Object.keys(DIMENSION_FIXTURES) as RatingCategory[];
    await prisma.scoreDimension.deleteMany({
      where: {
        OR: allCategories.map((cat) => ({
          category: cat,
          name: { notIn: validDimensionKeys.filter((k) => k.category === cat).map((k) => k.name) },
        })),
      },
    });

    const dimensionUpserts = Object.entries(DIMENSION_FIXTURES).flatMap(([category, dimensions]) =>
      dimensions.map((dimension, index) =>
        prisma.scoreDimension.upsert({
          where: {
            category_name: {
              category: category as RatingCategory,
              name: dimension.key,
            },
          },
          update: {
            label: {
              tc: dimension.label,
              sc: dimension.label,
              en: dimension.label,
              left: dimension.left,
              right: dimension.right,
            },
            order: index,
          },
          create: {
            category: category as RatingCategory,
            name: dimension.key,
            label: {
              tc: dimension.label,
              sc: dimension.label,
              en: dimension.label,
              left: dimension.left,
              right: dimension.right,
            },
            order: index,
          },
        })
      )
    );

    const majorUpserts = HKBU_MAJOR_RATING_ITEMS.map((major) =>
      prisma.ratingItem.upsert({
        where: { id: major.id },
        update: {
          category: RatingCategory.MAJOR,
          name: major.name,
          department: major.department,
        },
        create: {
          id: major.id,
          category: RatingCategory.MAJOR,
          name: major.name,
          department: major.department,
        },
      })
    );

    const teacherUpserts = HKBU_TEACHER_SEED_FIXTURES.map((teacher) =>
      prisma.ratingItem.upsert({
        where: { id: teacher.id },
        update: {
          category: RatingCategory.TEACHER,
          name: teacher.name,
          department: teacher.department,
          email: teacher.email,
        },
        create: {
          id: teacher.id,
          category: RatingCategory.TEACHER,
          name: teacher.name,
          department: teacher.department,
          email: teacher.email,
        },
      })
    );

    const courseUpserts = HKBU_COURSE_SEED_FIXTURES.map((course) =>
      prisma.ratingItem.upsert({
        where: { id: course.id },
        update: {
          category: RatingCategory.COURSE,
          name: course.name,
          department: course.department,
          code: course.code,
        },
        create: {
          id: course.id,
          category: RatingCategory.COURSE,
          name: course.name,
          department: course.department,
          code: course.code,
        },
      })
    );

    const canteenUpserts = HKBU_CANTEEN_SEED_FIXTURES.map((canteen) =>
      prisma.ratingItem.upsert({
        where: { id: canteen.id },
        update: {
          category: RatingCategory.CANTEEN,
          name: canteen.name,
          department: canteen.department,
          location: canteen.location,
        },
        create: {
          id: canteen.id,
          category: RatingCategory.CANTEEN,
          name: canteen.name,
          department: canteen.department,
          location: canteen.location,
        },
      })
    );

    await Promise.all([
      ...dimensionUpserts,
      ...majorUpserts,
      ...teacherUpserts,
      ...courseUpserts,
      ...canteenUpserts,
    ]);
    _seedDataInitialized = true;
    try {
      // Persist flag for 24h — survives server restarts and works across instances
      await redis.set("rating:seed:done", SEED_VERSION, "EX", 86400);
    } catch {
      // Redis down — in-memory flag still works for this instance
    }
  })();

  try {
    await _seedDataInitializationPromise;
  } finally {
    _seedDataInitializationPromise = null;
  }
}

export async function getRatingDimensions(categoryInput: string) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();
  const dimensions = await prisma.scoreDimension.findMany({
    where: { category },
    orderBy: { order: "asc" },
  });

  return dimensions.map((dimension) => ({
    name: dimension.name,
    label: dimension.label,
    order: dimension.order,
  }));
}

function buildTagOptions(ratings: Array<{ tags: string[] }>): string[] {
  const ratingTags = ratings.flatMap((rating) => rating.tags ?? []);
  return Array.from(new Set(ratingTags)).filter(Boolean);
}

// Predefined tag options per category — keys must match ratingTranslations.ts in frontend
const DEFAULT_TAGS: Record<RatingCategory, string[]> = {
  TEACHER: ['#Great Prof', '#Recorded Lectures', '#Easy Exams', '#Beginner Friendly', '#Recommended', '#Flexible Deadline', '#Less HW', '#Final Exam'],
  COURSE: ['#Practical', '#Interesting', '#Group Project', '#Good Grades', '#Easy Exams', '#Recommended', '#Less HW', '#Beginner Friendly'],
  CANTEEN: ['#Big Portions', '#Many Options', '#Long Queue', '#Good Chinese Food', '#Nice Environment', '#A Bit Pricey', '#Good Value', '#Recommended'],
  MAJOR: ['#High Employment', '#Many Internships', '#Good Facilities', '#Creative Freedom', '#Hands-on', '#Exchange Opps', '#Interesting', '#Recommended'],
};

export async function getRatingTagOptions(categoryInput: string) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();
  const items = await prisma.ratingItem.findMany({
    where: { category },
    select: {
      ratings: {
        select: {
          tags: true,
        },
      },
    },
  });

  const userTags = buildTagOptions(items.flatMap((item) => item.ratings));
  // Merge user-submitted tags with defaults, deduplicated
  const defaults = DEFAULT_TAGS[category] || [];
  return Array.from(new Set([...userTags, ...defaults]));
}

function buildSummaryFromItem(
  item: {
    id: string;
    category: RatingCategory;
    name: string;
    department: string;
    code: string | null;
    email: string | null;
    location: string | null;
    avatar: string | null;
    ratings: Array<{
      createdAt: Date;
      scores: Prisma.JsonValue;
      tags: string[];
    }>;
  },
  dimensions: Array<{ name: string; label: Prisma.JsonValue }>
): RatingSummary {
  const safeName = sanitizeText(item.name, sanitizeText(item.code, sanitizeText(item.email, "Untitled")));
  const safeDepartment = sanitizeText(item.department, sanitizeText(item.location, "Unknown"));
  const actualRatings = item.ratings ?? [];

  let tagCounts: Record<string, number> = {};
  let ratingCount = 0;
  let recentCount = 0;
  let scoreVariance = 0;
  let scoreValues: Record<string, number> = {};

  if (actualRatings.length > 0) {
    ratingCount = actualRatings.length;
    recentCount = actualRatings.filter((rating) => rating.createdAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;

    const scoreRecords = actualRatings.map((rating) => parseScoreRecord(rating.scores));
    const perRatingOverall = scoreRecords.map((record) => {
      const values = Object.values(record);
      if (values.length === 0) return 0;
      return (values.reduce((sum, value) => sum + value, 0) / values.length) * 20;
    });
    scoreVariance = computeStdDev(perRatingOverall);

    const aggregate: Record<string, { total: number; count: number }> = {};
    for (const record of scoreRecords) {
      for (const [key, value] of Object.entries(record)) {
        aggregate[key] ??= { total: 0, count: 0 };
        aggregate[key].total += value;
        aggregate[key].count += 1;
      }
    }
    for (const [key, value] of Object.entries(aggregate)) {
      scoreValues[key] = roundToTwo(value.total / value.count);
    }

    for (const rating of actualRatings) {
      for (const tag of rating.tags ?? []) {
        const normalizedTag = sanitizeText(tag);
        if (!normalizedTag) continue;
        tagCounts[normalizedTag] = (tagCounts[normalizedTag] ?? 0) + 1;
      }
    }
  }

  const scores = dimensions.map((dimension) => {
    // dimension.label can be a JSON object {tc,sc,en} or a plain string from DIMENSION_FIXTURES
    const rawLabel = dimension.label;
    let label: string;
    if (typeof rawLabel === "string") {
      label = rawLabel;
    } else if (rawLabel && typeof rawLabel === "object") {
      const labelObj = rawLabel as Record<string, unknown>;
      // Try to extract a string label, prefer the fixture label field
      label = (typeof labelObj.en === "string" && labelObj.en.trim()) ? labelObj.en
        : (typeof labelObj.tc === "string" && labelObj.tc.trim()) ? labelObj.tc as string
        : dimension.name;
    } else {
      label = dimension.name;
    }
    return {
      key: dimension.name,
      label,
      value: roundToTwo((scoreValues[dimension.name] ?? 0) * 20),
    };
  });

  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  return {
    id: item.id,
    category: item.category,
    name: safeName,
    department: safeDepartment,
    code: item.code,
    email: item.email,
    location: item.location,
    avatar: item.avatar,
    scores,
    tags: sortedTags,
    tagCounts,
    ratingCount,
    recentCount,
    scoreVariance,
  };
}

export async function getRatingList(categoryInput: string, sortMode: string | null) {
  const category = parseCategory(categoryInput);
  const effectiveSort = sortMode ?? "recent";
  const cacheKey = `rating:list:${category}:${effectiveSort}`;

  // Check Redis cache first (2 min TTL)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis down — fall through to DB
  }

  await ensureRatingSeedData();

  const [items, dimensions] = await Promise.all([
    prisma.ratingItem.findMany({
      where: { category },
      include: {
        ratings: {
          select: {
            createdAt: true,
            scores: true,
            tags: true,
          },
        },
      },
    }),
    prisma.scoreDimension.findMany({
      where: { category },
      orderBy: { order: "asc" },
      select: {
        name: true,
        label: true,
      },
    }),
  ]);

  const summaries = items
    .map((item) => buildSummaryFromItem(item, dimensions))
    .filter((item) => sanitizeText(item.name).length > 0);

  if (effectiveSort === "controversial") {
    summaries.sort((a, b) => b.scoreVariance - a.scoreVariance || b.ratingCount - a.ratingCount || (a.code ?? a.name).localeCompare(b.code ?? b.name));
  } else {
    // Default: sort by name alphabetically
    summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Cache result for 2 minutes
  try {
    await redis.set(cacheKey, JSON.stringify(summaries), "EX", 120);
  } catch {
    // Redis down — continue without cache
  }

  return summaries;
}

export async function getRatingDetail(categoryInput: string, id: string) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();

  const [item, dimensions] = await Promise.all([
    prisma.ratingItem.findFirst({
      where: {
        id,
        category,
      },
      include: {
        ratings: {
          select: {
            createdAt: true,
            scores: true,
            tags: true,
            comment: true,
          },
        },
      },
    }),
    prisma.scoreDimension.findMany({
      where: { category },
      orderBy: { order: "asc" },
      select: {
        name: true,
        label: true,
      },
    }),
  ]);

  if (!item) {
    throw new NotFoundError("Rating item not found");
  }

  const summary = buildSummaryFromItem(item, dimensions);

  // Collect anonymous comments (no user info exposed)
  const comments = item.ratings
    .filter((r) => r.comment && r.comment.trim().length > 0)
    .map((r) => ({
      comment: r.comment!,
      createdAt: r.createdAt.toISOString(),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { ...summary, comments };
}

/**
 * Get the current user's rating for a specific item (if any).
 * Returns null if the user hasn't rated this item.
 */
export async function getMyRating(
  userId: string,
  categoryInput: string,
  id: string,
) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();

  const rating = await prisma.rating.findFirst({
    where: {
      itemId: id,
      userId,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      scores: true,
      tags: true,
      comment: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!rating) return null;

  return {
    id: rating.id,
    scores: rating.scores as Record<string, number>,
    tags: rating.tags,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
    updatedAt: rating.updatedAt.toISOString(),
  };
}

export async function submitRatingForItem(
  userId: string,
  categoryInput: string,
  id: string,
  payload: {
    scores: Record<string, number>;
    tags: string[];
    comment?: string;
    semester?: string;
  }
) {
  const category = parseCategory(categoryInput);
  await ensureRatingSeedData();

  const item = await prisma.ratingItem.findFirst({
    where: { id, category },
    select: { id: true },
  });

  if (!item) {
    throw new NotFoundError("Rating item not found");
  }

  const semester = sanitizeText(payload.semester) || null;
  const existing = await prisma.rating.findFirst({
    where: {
      itemId: id,
      userId,
      ...(semester ? { semester } : { semester: null }),
    },
    select: { id: true },
  });

  const normalizedScores = Object.entries(payload.scores ?? {}).reduce<Record<string, number>>((acc, [key, value]) => {
    if (!key) return acc;
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      acc[key] = Math.max(0, Math.min(5, numeric));
    }
    return acc;
  }, {});

  const normalizedTags = Array.from(
    new Set((payload.tags ?? []).map((tag) => sanitizeText(tag)).filter(Boolean))
  ).slice(0, 10);

  if (existing) {
    await prisma.rating.update({
      where: { id: existing.id },
      data: {
        scores: normalizedScores,
        tags: normalizedTags,
        comment: sanitizeText(payload.comment) || null,
        semester,
      },
    });
  } else {
    await prisma.rating.create({
      data: {
        itemId: id,
        userId,
        scores: normalizedScores,
        tags: normalizedTags,
        comment: sanitizeText(payload.comment) || null,
        semester,
      },
    });
  }

  // Invalidate Redis cache so updated scores show immediately
  try {
    const keys = await redis.keys(`rating:list:${category}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Redis down — cache will expire naturally (2 min TTL)
  }

  return { success: true };
}

export const APP_LANGUAGES = ["tc", "sc", "en"] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

const SIMPLIFIED_ONLY_CHARS = new Set(
  "边变并从点东对发该个关广归国过还后欢会机几间见将进经开里两吗么没们难让认说书术台听图网为问无现线样应于与则这专总车儿云价众优伞伟传伤伦侧侨俩俭债倾偿储兑册军农凉减凤凑击划刘删别刹剂剑剧劳势勋匀协单卖卢卤卫厅历压厌县叁双吴呐启员咸响哗唤啰团园围坛圣场坏块坚坛坝坟坠垄垅垒梦够夹夺奋奖妇妈姗娄娱孙学宁宝实宠审宪宫宾宽宾寝寿将尔尘尝层岭岳岛峡币帅师帐帘帜带帮庆庄库应庙庞废庐开异弃张弥弯弹强归录径彻忆忧怀态怜总恋恒恳恶惊惧惭惯愤愿戏战户扩扫扬扰抚报担拟拢拥择挂挚挠挡挣挥捞损换据掳摆摇摄摊敌数斋断无旧时显晋晒晓晕暂术朴机杀杂权杨杰极构枪柜栅栋栏树栖样档桥梦检楼欢欧欲殁毕毁毙毡氢汇汉汤沟没泽洁洒浇测济浑浓涂涛润涩涌涨渐渔湾湿满滤滥灭灯灵灾炖点炼烁烂热焕爱爷牍牦牵犹狈猎猫献环珐玛玱现琐电画畅疗疮疯瘫盐监盖盘眯着矫矿码砖砚碍确碱礼祃祷祸离秃积称秽税穷窃窍竞笔筑签筹简粮糁糇糊纠红纤约级纪纫纬纯纱纲纳纵纷纸纹纺纽线练组绅细织终绉绍绎经绑绒结绕绘给络绝绞统绢绣继绥绦续绮绯维绵绶绷绸综绽绿缀缄缅缆缉缎缓缔缕编缘缚缝缠缩缪缭缴罢罗罚罴羁翘耸耻聋职联肃肠肤肮肴肾肿胀胁胆胜胡胧胶脑脚脱脸腊腻舆舰舱艺节芜苇苏苹范茎茧荐荡荣荤荧药获莹营萨蒋蓝蓟蓦蔑蕴虫虬虽虾蚀蚁蚂蛊蛎蚕蛮蛰蜗蝇蝉衅补衬衮袄袜袭装览觉觅觇觊觌觎觞触誉计划讯议让许论讼设访诀证评诅识诈诉诊诋词译试诗诚诛诞话诡询诣该详诧诫诬语误诱诲说诵请诸诺读诽课谁调谅谆谈谊谋谌谍谎谐谑谒谓谕谗谙谚谛谜谢谣谨谩谬谭谱谴谷贝负贡财责贤败账货质贩贪贫贬购贮贯贰贱贲贴贵贷贸费贺贼贽贾资赅赈赊赋赌赎赏赐赔赖赚赛赞赶赵趋趱跃跄跞践跷跸跹踊踌踪踬踯蹑躏躯车轧轨轩轫转轮软轰轴轱轲轳轶轻载轼轿辀辁辂较辅辆辇辈辉辊辋辌辍辎辏辐辑输辔辕辖辗辘辙辞辩辫边辽达迁迩迟适选逊递逦逻遗遥邮邻郁郐郑郓郦郧酝酱释里鉴銮錾钅钇针钉钊钋钌钍钎钏钐钒钓钔钕钗钙钛钜钝钞钟钠钡钢钣钥钦钧钨钩钮钯钰钱钲钳钴钵钶钷钸钹钺钻钼钽钾钿铀铁铂铃铄铅铆铈铉铊铋铌铍铎铐铑铒铕铖铗铘铙铛铜铝铞铟铠铡铢铣铤铥铧铨铩铪铫铬铭铮铰铱铲铳铵银铷铸铺链销锁锂锄锅锆锇锈锉锋锌锐锒锔锕锖锗错锚锛锜锞锡锢锣锤锥锦锨锩锪锫锬锭键锯锰锱锲锳锴锵锶锷锹锺锻锼锾镀镁镂镄镅镆镇镉镊镌镍镏镐镑镒镓镔镕镖镗镘镛镜镝镞镣镥镦镧门闩闪闭问闯闰闲间闵闶闷闸闹闻闽阀阁阂阃阄阅阆阇阈阉阊阋阌阍阎阐阔阕阖阗阙阚队阳阴阵阶际陆陇陈陉陕陧陨险随隐隶难雏雠雳霁霉鞑韩页顶顷项顺须顽顾顿颀颁颂预颅领颇颈颉颊颌颍颏颐频颓颔颖颗题颜额颞颠颡风飏飐飑飒飓飔飞饥饧饨饩饪饫饭饮饯饰饱饲饴饵饶饷饺饼饿馀馁馄馅馆馈馉馊馋馌馍馏馐馑馒馓馔驭驮驯驰驱驳驴驶驷驸驹驻驼驾骀骁骂骄骅骆骇骈骊验骏骐骑骗骚骛骜骝骞骟骠骡骤髅鲀鲁鲂鲅鲆鲇鲈鲋鲍鲎鲐鲑鲒鲔鲕鲗鲚鲛鲜鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲫鲭鲮鲰鲱鲲鲳鲴鲵鲷鲸鲺鲻鳃鳄鳅鳆鳇鳊鳋鳌鳍鳎鳏鳐鳓鳔鳕鳖鳗鳘鳙鳜鳝鳞鳟鸟鸡鸣鸥鸦鸨鸩鸪鸭鸯鸱鸲鸳鸵鸶鸽鸾鸿鹀鹂鹅鹆鹇鹈鹉鹊鹋鹌鹏鹑鹕鹗鹘鹚鹛鹜鹞鹣鹤鹦鹧鹨鹩鹪鹫鹬鹭鹰鹱麦黄黉黡黩黾鼋鼍"
);
const TRADITIONAL_ONLY_CHARS = new Set(
  "邊變並從點東對發該個關廣歸國過還後歡會機幾間見將進經開裡兩嗎麼沒們難讓認說書術臺聽圖網為問無現線樣應於與則這專總車兒雲價眾優傘偉傳傷倫側僑倆儉債傾償儲兌冊軍農涼減鳳湊擊劃劉刪別剎劑劍劇勞勢勳勻協單賣盧鹵衛廳歷壓厭縣參雙吳吶啟員鹹響嘩喚囉團園圍壇聖場壞塊堅壩墳墜壟壟壘夢夠夾奪奮獎婦媽姍婁娛孫學寧寶實寵審憲宮賓寬寢壽爾塵嘗層嶺嶽島峽幣帥師帳簾幟帶幫慶莊庫應廟龐廢廬開異棄張彌彎彈強歸錄徑徹憶憂懷態憐總戀恆懇惡驚懼慚慣憤願戲戰戶擴掃揚擾撫報擔擬攏擁擇掛摯撓擋掙揮撈損換據擄擺搖攝攤敵數齋斷無舊時顯晉曬曉暈暫術樸機殺雜權楊傑極構槍櫃柵棟欄樹棲樣檔橋夢檢樓歡歐慾歿畢毀斃氈氫匯漢湯溝沒澤潔灑澆測濟渾濃塗濤潤澀湧漲漸漁灣濕滿濾濫滅燈靈災燉點煉爍爛熱煥愛爺牘犛牽猶狽獵貓獻環琺瑪瑲現瑣電畫暢療瘡瘋癱鹽監蓋盤瞇著矯礦碼磚硯礙確鹼禮禡禱禍離禿積稱穢稅窮竊竅競筆築簽籌簡糧糝餱餬糾紅纖約級紀紉緯純紗綱納縱紛紙紋紡紐線練組紳細織終縐紹繹經綁絨結繞繪給絡絕絞統絹繡繼綏絛續綺緋維綿綬繃綢綜綻綠綴緘緬纜緝緞緩締縷編緣縛縫纏縮繆繚繳罷羅罰羆羈翹聳恥聾職聯肅腸膚骯餚腎腫脹脅膽勝衚朧膠腦腳脫臉臘膩輿艦艙藝節蕪葦蘇蘋範莖繭薦蕩榮葷熒藥獲瑩營薩蔣藍薊驀蔑蘊蟲虯雖蝦蝕蟻螞蠱蠣蠶蠻蟄蝸蠅蟬釁補襯袞襖襪襲裝覽覺覓覘覬覿覦觴觸譽計劃訊議讓許論訟設訪訣證評詛識詐訴診詆詞譯試詩誠誅誕話詭詢詣該詳詫誡誣語誤誘誨說誦請諸諾讀誹課誰調諒諄談誼謀諶諜謊諧謔謁謂諭讒諳諺諦謎謝謠謹謾謬譚譜譴穀貝負貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貼貴貸貿費賀賊贄賈資賅賑賒賦賭贖賞賜賠賴賺賽贊趕趙趨躥躍蹌躒踐蹺蹕躚踴躊蹤躓躑躡躪軀車軋軌軒軔轉輪軟轟軸軲軻轤軼輕載軾轎輈輇輅較輔輛輦輩輝輥輞輬輟輜輳輻輯輸轡轅轄輾轆轍辭辯辮邊遼達遷邇遲適選遜遞邐邏遺遙郵鄰鬱鄶鄭鄆酈鄖醞醬釋裡鑒鑾鏨釒釔針釘釗釙釕釷釺釧釤釩釣鍆釹釵鈣鈦鉅鈍鈔鐘鈉鋇鋼鈑鑰欽鈞鎢鉤鈕鈀鈺錢鉦鉗鈷缽鈳鉕鈽鈸鉞鑽鉬鎢鉀鈿鈾鐵鉑鈴鑠鉛鉚鈰鉉鉈鉍鈮鈹鐸銬銠鉺銪鋮鋏鋣鐃鐺銅鋁銱銦鎧鍘銖銑鋌銩鏵銓鎩鉿銚鉻銘錚鉸銥鏟銃銨銀銣鑄鋪鏈銷鎖鋰鋤鍋鋯鋨鏽銼鋒鋅銳鋃鋦錒錆鍺錯錨錛錡錁錫錮鑼錘錐錦鍁錈鍃錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍬鍾鍛鎪鍰鍍鎂鏤鐨鎇鏌鎮鎘鑷鎸鎳鎦鎬鎊鎰鎵鑌鎔鏢鏜鏝鏞鏡鏑鏃鐐鑣鑥鐓鑭門閂閃閉問闖閏閒間閔閌悶閘鬧聞閩閥閣閡閫閱閬闍閾閹閶鬩閿閽閻闡闊闋闔闐闕闞隊陽陰陣階際陸隴陳陘陝隉隕險隨隱隸難雛讎靂霽黴韃韓頁頂頃項順須頑顧頓頎頒頌預顱領頗頸頡頰頜潁頦頤頻頹頷穎顆題顏額顳顛顙風颺颭颮颯颶颸飛飢餳飩飼飪飫飯飲餞飾飽飼飴餌饒餉餃餅餓餘餒餛餡館饋餶餿饞饁饃餾饈饉饅饊饌馭馱馴馳驅駁驢駛駟駙駒駐駝駕駘驍罵驕驊駱駭駢驪驗駿騏騎騙騷騖驁騮騫騸驃騾驟髏鮁魯魴鮃鮎鱸鮒鮑鱟鮐鮭鮚鮪鮞鱭鮫鮮鯗鱘鯁鱺鰱鰹鯉鰣鰷鯀鯊鯇鯽鯖鯪鯫鯡鯤鯧鯝鯢鯛鯨鯴鯔鰓鱷鰍鰒鰉鯿鰠鼇鰭鰨鰥鰩鰳鰾鱈鱉鰻鰵鱅鱖鱔鱗鱒鳥雞鳴鷗鴉鴇鴆鴣鴨鴦鴟鴝鴛鴕鷥鴿鸞鴻鵐鸝鵝鵒鷳鵜鵡鵲鶓鵪鵬鶉鶘鶚鶻鷀鶥鶩鷂鶼鶴鸚鷓鷚鷯鷦鷲鷸鷺鷹鸌麥黃黌黶黷黽黿鼉"
);

function countScriptMatches(text: string, charset: Set<string>) {
  let count = 0;
  for (const ch of text) {
    if (charset.has(ch)) count += 1;
  }
  return count;
}

export function normalizeAppLanguage(language?: string | null): AppLanguage | null {
  if (!language) return null;
  if (language === "tc" || language === "zh-TW" || language === "zh_HK") return "tc";
  if (language === "sc" || language === "zh-CN" || language === "zh_Hans") return "sc";
  if (language === "en" || language.toLowerCase().startsWith("en")) return "en";
  return null;
}

export function resolveAppLanguage(language?: string | null, fallback: AppLanguage = "tc"): AppLanguage {
  return normalizeAppLanguage(language) ?? fallback;
}

export function resolveRequestLanguage(
  headers: Pick<Headers, "get">,
  fallback: AppLanguage = "tc"
): AppLanguage {
  const rawLanguage = headers.get("accept-language");
  const primaryLanguage = rawLanguage?.split(",")[0]?.trim();
  return resolveAppLanguage(primaryLanguage, fallback);
}

export function detectContentLanguage(
  inputs: Array<string | null | undefined>,
  fallback: AppLanguage = "tc"
): AppLanguage {
  const text = inputs
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();

  if (!text) return fallback;

  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjkCount = (text.match(/[\u3400-\u9FFF]/gu) ?? []).length;
  if (latinCount > 0 && (cjkCount === 0 || latinCount >= cjkCount * 2)) {
    return "en";
  }

  const simplifiedCount = countScriptMatches(text, SIMPLIFIED_ONLY_CHARS);
  const traditionalCount = countScriptMatches(text, TRADITIONAL_ONLY_CHARS);

  if (simplifiedCount > traditionalCount) return "sc";
  if (traditionalCount > simplifiedCount) return "tc";

  return fallback;
}

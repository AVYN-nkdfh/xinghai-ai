/*
 * 给孩子的修改入口：
 * 1. 想改分类，就编辑 COPY_CATEGORIES。
 * 2. 想改文案，就编辑 COPY_ITEMS 里的 text、scene 和 tags。
 * 3. 每条 id 不要重复，category 要和分类 id 对应。
 */

const COPY_CATEGORIES = [
  { id: "all", name: "全部", color: "purple" },
  { id: "love", name: "恋爱", color: "pink" },
  { id: "mood", name: "情绪", color: "purple" },
  { id: "travel", name: "出游", color: "orange" },
  { id: "friendship", name: "友情", color: "green" },
];

const COPY_ITEMS = [
  { id: 1, category: "love", scene: "坦白", tone: "直球", text: "喜欢这件事，我想说得坦荡一点。", tags: ["喜欢", "告白", "恋爱"] },
  { id: 2, category: "love", scene: "想念", tone: "克制", text: "今天没有特别的事，只是特别想你。", tags: ["想念", "日常", "恋爱"] },
  { id: 3, category: "love", scene: "纪念", tone: "温柔", text: "把普通日子过成了我们的小纪念。", tags: ["纪念日", "日常", "恋爱"] },
  { id: 4, category: "love", scene: "暧昧", tone: "含蓄", text: "晚风知道，我最近总在想谁。", tags: ["暧昧", "晚风", "恋爱"] },
  { id: 5, category: "mood", scene: "放松", tone: "治愈", text: "允许今天慢一点，世界不会催我。", tags: ["治愈", "慢生活", "情绪"] },
  { id: 6, category: "mood", scene: "低落", tone: "轻盈", text: "雾会散，我也会慢慢轻下来。", tags: ["低落", "治愈", "情绪"] },
  { id: 7, category: "mood", scene: "独处", tone: "安静", text: "安静不是没话说，是在和自己待一会儿。", tags: ["独处", "安静", "情绪"] },
  { id: 8, category: "mood", scene: "散心", tone: "抽象", text: "情绪到站了，我先下车透口气。", tags: ["散心", "抽象", "情绪"] },
  { id: 9, category: "travel", scene: "出发", tone: "期待", text: "去没去过的地方，看没看过的黄昏。", tags: ["旅行", "出发", "黄昏"] },
  { id: 10, category: "travel", scene: "在路上", tone: "文艺", text: "照片会褪色，走过的路不会。", tags: ["旅行", "照片", "文艺"] },
  { id: 11, category: "travel", scene: "拍照", tone: "温柔", text: "今天的风景，适合存进很久以后。", tags: ["风景", "拍照", "旅行"] },
  { id: 12, category: "travel", scene: "周末", tone: "轻松", text: "出发不用很远，心情换个方向就好。", tags: ["周末", "短途", "旅行"] },
  { id: 13, category: "friendship", scene: "见面", tone: "真诚", text: "见面吧，把聊天框里的话说完。", tags: ["朋友", "见面", "友情"] },
  { id: 14, category: "friendship", scene: "想念", tone: "温暖", text: "好朋友是忙完以后还会想起的人。", tags: ["想念", "朋友", "友情"] },
  { id: 15, category: "friendship", scene: "重逢", tone: "默契", text: "不用常联系，见面还是同一频道。", tags: ["重逢", "默契", "友情"] },
  { id: 16, category: "friendship", scene: "聚会", tone: "热闹", text: "这一桌的热闹，刚好都是喜欢的人。", tags: ["聚会", "朋友", "友情"] },
];

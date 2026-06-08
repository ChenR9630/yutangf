export type StickerCategory = "摸鱼" | "职场" | "情绪" | "互动";

export type StickerDefinition = {
  id: string;
  label: string;
  caption: string;
  emoji: string;
  category: StickerCategory;
  tone: string;
  keywords: string[];
};

export const stickerCategories: Array<"全部" | StickerCategory> = ["全部", "摸鱼", "职场", "情绪", "互动"];

export const stickers: StickerDefinition[] = [
  { id: "fish-slack", label: "正在摸鱼", caption: "水面平静，水下摸鱼", emoji: "🐟", category: "摸鱼", tone: "aqua", keywords: ["摸鱼", "划水", "休息"] },
  { id: "fish-clock", label: "下班倒计时", caption: "心已下班，人还在线", emoji: "⏰", category: "摸鱼", tone: "yellow", keywords: ["下班", "倒计时", "工位"] },
  { id: "fish-tea", label: "喝口水先", caption: "大事缓办，小事喝茶", emoji: "🍵", category: "摸鱼", tone: "mint", keywords: ["喝水", "喝茶", "缓缓"] },
  { id: "fish-lunch", label: "干饭要紧", caption: "项目可以等，饭点不等人", emoji: "🍚", category: "摸鱼", tone: "orange", keywords: ["吃饭", "午饭", "干饭"] },
  { id: "fish-meeting", label: "收到开会", caption: "人到会场，灵魂稍后加入", emoji: "📝", category: "职场", tone: "blue", keywords: ["开会", "会议", "收到"] },
  { id: "fish-change", label: "简单改改", caption: "简单两个字，改到下辈子", emoji: "🔧", category: "职场", tone: "red", keywords: ["修改", "甲方", "简单"] },
  { id: "fish-overtime", label: "自愿加班", caption: "主打一个自愿被自愿", emoji: "🌙", category: "职场", tone: "violet", keywords: ["加班", "熬夜", "自愿"] },
  { id: "fish-done", label: "优雅交付", caption: "交付前一秒，依然从容", emoji: "✅", category: "职场", tone: "green", keywords: ["完成", "交付", "搞定"] },
  { id: "fish-broken", label: "小小破防", caption: "问题不大，心态重启", emoji: "💔", category: "情绪", tone: "pink", keywords: ["破防", "难过", "心态"] },
  { id: "fish-speechless", label: "沉默震耳欲聋", caption: "此刻无声胜有声", emoji: "……", category: "情绪", tone: "gray", keywords: ["无语", "沉默", "离谱"] },
  { id: "fish-proud", label: "拿捏了", caption: "区区难题，轻松拿捏", emoji: "👌", category: "情绪", tone: "lime", keywords: ["拿捏", "可以", "厉害"] },
  { id: "fish-laugh", label: "笑不活了", caption: "今天的功德先笑没一点", emoji: "😂", category: "情绪", tone: "yellow", keywords: ["好笑", "哈哈", "笑死"] },
  { id: "fish-watch", label: "前排吃瓜", caption: "瓜已切好，坐等后续", emoji: "🍉", category: "互动", tone: "red", keywords: ["吃瓜", "围观", "后续"] },
  { id: "fish-clap", label: "这波可以", caption: "塘里一致通过", emoji: "👏", category: "互动", tone: "aqua", keywords: ["鼓掌", "支持", "可以"] },
  { id: "fish-question", label: "你细说", caption: "这个话题值得展开一下", emoji: "👂", category: "互动", tone: "orange", keywords: ["细说", "展开", "好奇"] },
  { id: "fish-hug", label: "抱抱鱼友", caption: "先接住你，再解决问题", emoji: "🫂", category: "互动", tone: "pink", keywords: ["抱抱", "安慰", "支持"] },
  { id: "fish-respect", label: "瑞思拜", caption: "这操作，鱼塘认证", emoji: "🫡", category: "互动", tone: "blue", keywords: ["佩服", "厉害", "respect"] },
  { id: "fish-wow", label: "还有高手", caption: "本以为是池塘，原来是深海", emoji: "😮", category: "互动", tone: "violet", keywords: ["高手", "震惊", "厉害"] },
];

export const stickerById = Object.fromEntries(stickers.map((sticker) => [sticker.id, sticker])) as Record<string, StickerDefinition>;

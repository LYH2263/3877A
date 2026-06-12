import bcrypt from "bcryptjs";
import { FeedChannel, MediaType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

async function main() {
  const usersCount = await prisma.user.count();
  if (usersCount > 0) {
    console.log("Seed skipped: database already initialized.");
    return;
  }

  const passwordHash = await bcrypt.hash("123456", 10);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "demo@social.com",
        nickname: "橙子同学",
        avatarUrl: "/uploads/seed/avatar-1.svg",
        level: "会员V3",
        bio: "记录城市里的微小热爱"
      }
    }),
    prisma.user.create({
      data: {
        email: "xiaoyu@social.com",
        nickname: "小雨看世界",
        avatarUrl: "/uploads/seed/avatar-2.svg",
        level: "会员V2",
        bio: "热爱拍照，也爱碎碎念"
      }
    }),
    prisma.user.create({
      data: {
        email: "runner@social.com",
        nickname: "阿杰夜跑",
        avatarUrl: "/uploads/seed/avatar-3.svg",
        level: "会员V1",
        bio: "坚持每周四次夜跑"
      }
    }),
    prisma.user.create({
      data: {
        email: "creator@social.com",
        nickname: "创作实验室",
        avatarUrl: "/uploads/seed/avatar-2.svg",
        level: "创作者认证",
        bio: "分享内容创作方法论"
      }
    })
  ]);

  await prisma.userCredential.createMany({
    data: users.map((user) => ({
      userId: user.id,
      passwordHash
    }))
  });

  await prisma.userSettings.createMany({
    data: users.map((user) => ({
      userId: user.id,
      notifyLike: true,
      notifyComment: true,
      notifyRepost: true,
      notifyFollow: true
    }))
  });

  const topics = await Promise.all([
    prisma.topic.create({ data: { rank: 1, keyword: "城市日落", heat: 952000, tag: "沸" } }),
    prisma.topic.create({ data: { rank: 2, keyword: "同城夜跑", heat: 810000, tag: "新" } }),
    prisma.topic.create({ data: { rank: 3, keyword: "咖啡地图", heat: 702000, tag: "热" } }),
    prisma.topic.create({ data: { rank: 4, keyword: "通勤穿搭", heat: 658000, tag: "热" } }),
    prisma.topic.create({ data: { rank: 5, keyword: "周末短途", heat: 603000, tag: "新" } })
  ]);

  const [u1, u2, u3, u4] = users;

  const post1 = await prisma.post.create({
    data: {
      authorId: u2.id,
      content: "今天的天边像打翻了橙汁，随手拍了一张 #城市日落#，希望你也能被温柔到。",
      source: "iPhone 16 Pro",
      channel: FeedChannel.hot,
      createdAt: minutesAgo(15),
      media: {
        create: [{ type: MediaType.image, url: "/uploads/seed/post-1.svg", sortOrder: 0 }]
      }
    }
  });

  const post2 = await prisma.post.create({
    data: {
      authorId: u3.id,
      content: "#同城夜跑# 第 38 天，配速稳定在 5'30''，你们一般几点开跑？",
      source: "运动手表同步",
      channel: FeedChannel.city,
      createdAt: minutesAgo(35),
      media: {
        create: [{ type: MediaType.image, url: "/uploads/seed/post-2.svg", sortOrder: 0 }]
      }
    }
  });

  const post3 = await prisma.post.create({
    data: {
      authorId: u4.id,
      content: "新手博主第一条建议：持续更新比完美更重要。#创作成长#",
      source: "Web",
      channel: FeedChannel.hot,
      createdAt: minutesAgo(70)
    }
  });

  const post4 = await prisma.post.create({
    data: {
      authorId: u1.id,
      content: "午休发现了一家安静小店，打算做一期 #咖啡地图#，有没有推荐？",
      source: "Android 客户端",
      channel: FeedChannel.city,
      createdAt: minutesAgo(120)
    }
  });

  await prisma.postTopic.createMany({
    data: [
      { postId: post1.id, topicId: topics[0].id },
      { postId: post2.id, topicId: topics[1].id },
      { postId: post4.id, topicId: topics[2].id }
    ]
  });

  await prisma.follow.createMany({
    data: [
      { followerId: u1.id, followingId: u2.id },
      { followerId: u1.id, followingId: u3.id },
      { followerId: u2.id, followingId: u3.id }
    ]
  });

  await prisma.user.update({
    where: { id: u1.id },
    data: { followingCount: 2 }
  });
  await prisma.user.update({ where: { id: u2.id }, data: { followersCount: 1, followingCount: 1 } });
  await prisma.user.update({ where: { id: u3.id }, data: { followersCount: 2 } });

  await prisma.like.createMany({
    data: [
      { userId: u1.id, postId: post1.id },
      { userId: u1.id, postId: post2.id },
      { userId: u2.id, postId: post2.id }
    ]
  });

  const repostPost = await prisma.post.create({
    data: {
      authorId: u1.id,
      repostOfId: post3.id,
      content: "这个建议太实用了",
      source: "转发",
      channel: post3.channel,
      createdAt: minutesAgo(20)
    }
  });

  await prisma.repost.create({
    data: {
      userId: u1.id,
      postId: post3.id,
      content: "这个建议太实用了"
    }
  });

  await prisma.comment.createMany({
    data: [
      { userId: u1.id, postId: post1.id, content: "这张色调太舒服了！" },
      { userId: u3.id, postId: post1.id, content: "同感，今天晚霞真的很美" },
      { userId: u2.id, postId: post2.id, content: "一起打卡，最近也在坚持" }
    ]
  });

  const postStats = [post1.id, post2.id, post3.id, post4.id, repostPost.id];
  for (const postId of postStats) {
    const [likesCount, commentsCount, repostsCount] = await Promise.all([
      prisma.like.count({ where: { postId } }),
      prisma.comment.count({ where: { postId } }),
      prisma.repost.count({ where: { postId } })
    ]);
    const hotScore = likesCount * 4 + commentsCount * 6 + repostsCount * 8;
    await prisma.post.update({ where: { id: postId }, data: { likesCount, commentsCount, repostsCount, hotScore } });
  }

  const batch = await prisma.recommendationBatch.create({ data: {} });
  await prisma.recommendationItem.createMany({
    data: [
      { batchId: batch.id, userId: u4.id, order: 1 },
      { batchId: batch.id, userId: u3.id, order: 2 },
      { batchId: batch.id, userId: u2.id, order: 3 }
    ]
  });

  await prisma.notification.createMany({
    data: [
      {
        targetUserId: u2.id,
        actorUserId: u1.id,
        postId: post1.id,
        type: "LIKE",
        content: "赞了你的动态",
        isRead: false,
        createdAt: minutesAgo(6)
      },
      {
        targetUserId: u2.id,
        actorUserId: u3.id,
        postId: post1.id,
        type: "COMMENT",
        content: "评论了你：同感，今天晚霞真的很美",
        isRead: false,
        createdAt: minutesAgo(4)
      },
      {
        targetUserId: u4.id,
        actorUserId: u1.id,
        postId: post3.id,
        type: "REPOST",
        content: "转发了你的动态",
        isRead: true,
        createdAt: minutesAgo(20)
      },
      {
        targetUserId: u3.id,
        actorUserId: u2.id,
        type: "FOLLOW",
        content: "关注了你",
        isRead: false,
        createdAt: minutesAgo(10)
      }
    ]
  });

  console.log("Seed completed. Demo account: demo@social.com / 123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

/**
 * 付费媒体系统的两张表。并入你的 Drizzle schema 入口后 `drizzle-kit push`。
 *
 * ⚠️ 唯一需要改的地方：media_unlocks.userId 的外键指向你项目的 users 表。
 *    不想加外键可直接删掉 .references(...)，靠应用层保证。
 */

// import { users } from '@/lib/db/schema' // ← 换成你项目的 users 表

export const mediaTypeEnum = pgEnum('paid_media_type', ['IMAGE', 'VIDEO'])

/** 展示用元数据，进 JSON、不参与查询；需要过滤的字段应独立成列 */
export type MediaAssetMetadata = {
  fileSize?: number
  width?: number
  height?: number
  /** 视频时长（秒） */
  duration?: number
  [key: string]: string | number | boolean | undefined
}

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filename: varchar('filename', { length: 255 }).notNull(),
    /** R2 私有桶内的对象 key。存储细节，永远不下发给客户端 */
    r2Key: varchar('r2_key', { length: 500 }).notNull(),

    mediaType: mediaTypeEnum('media_type').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    metadata: jsonb('metadata').$type<MediaAssetMetadata>().notNull().default({}),

    /** blurhash 预览串，锁定态也随列表下发（不含有效信息，安全） */
    blurhash: varchar('blurhash', { length: 100 }),
    /** 解锁所需费用，0 = 免费（仍要求登录，由 charge adapter 决定语义） */
    creditsCost: integer('credits_cost').notNull().default(0),
    /** 软删除 / 下架 / 内容审核 */
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_media_assets_active_created').on(table.isActive, table.createdAt),
    index('idx_media_assets_type_active').on(table.mediaType, table.isActive),
  ]
)

export const mediaUnlocks = pgTable(
  'media_unlocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    // .references(() => users.id, { onDelete: 'cascade' }), // ← 接你的 users 表
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    /** 成交价快照：资产以后调价，历史记录仍反映当时价格 */
    creditsCost: integer('credits_cost').notNull(),
    /** charge adapter 返回的计费凭据（积分流水 id / payment intent 等），系统只存不解释 */
    chargeRef: text('charge_ref'),
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
  },
  (table) => [
    // 幂等的最后防线：并发解锁也不会产生两条记录；同时就是权限检查的查询索引
    uniqueIndex('uq_media_unlocks_user_media').on(table.userId, table.mediaId),
  ]
)

export const mediaAssetsRelations = relations(mediaAssets, ({ many }) => ({
  unlocks: many(mediaUnlocks),
}))

export const mediaUnlocksRelations = relations(mediaUnlocks, ({ one }) => ({
  media: one(mediaAssets, {
    fields: [mediaUnlocks.mediaId],
    references: [mediaAssets.id],
  }),
}))

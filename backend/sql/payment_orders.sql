-- BJ 陪玩团支付流水表
-- 作用：关联 BJ 内部订单(bj_order_no) 与 mpay 外部订单(trade_no)，
--       并记录用户、商品类型、金额、状态、回调原始数据。
-- 位置：Linux 宝塔 MySQL 5.7（192.168.186.130），与 mpay 共库
--       库名 mpay_skypw_dpdns，由 .env DB_NAME 指定
--       mpay 自身表均带 mpay_ 前缀，本表不冲突

USE mpay_skypw_dpdns;

CREATE TABLE IF NOT EXISTS payment_orders (
  bj_order_no     VARCHAR(36) PRIMARY KEY COMMENT 'BJ 侧订单号，UUID',
  user_id         CHAR(36) NOT NULL COMMENT 'Supabase auth.users.id',
  item_type       VARCHAR(32) NOT NULL COMMENT 'vip_month | recharge',
  amount          DECIMAL(10,2) NOT NULL COMMENT '应付金额（元）',
  channel         VARCHAR(16) DEFAULT NULL COMMENT 'wxpay | alipay',
  mpay_trade_no   VARCHAR(64) DEFAULT NULL COMMENT 'mpay 返回的 trade_no',
  status          VARCHAR(16) DEFAULT 'pending' COMMENT 'pending | paid | failed',
  payload         JSON DEFAULT NULL COMMENT '创建/回调原始 JSON 数据',
  paid_at         DATETIME DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_mpay_trade_no (mpay_trade_no),
  INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BJ 支付订单流水';

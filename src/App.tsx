import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import Decimal from 'decimal.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import './App.css'
import {
  isLocalAppData,
  loadLocalData,
  saveLocalData,
  type LocalAppData,
  type Product,
  type StockMovement,
} from './localDatabase'

type ViewKey = 'dashboard' | 'sales' | 'orders' | 'inventory' | 'reports' | 'settings'
type IconName =
  | ViewKey
  | 'alert'
  | 'arrow'
  | 'box'
  | 'check'
  | 'clock'
  | 'money'
  | 'plus'
  | 'receipt'
  | 'scale'
  | 'spark'
  | 'trash'
  | 'trend'

interface DraftSaleItem {
  id: string
  productId: string
  productName: string
  unit: string
  amount: string
  unitPrice: string
  note: string
}

interface HistoricalOrder {
  id: string
  createdAt: string
  items: StockMovement[]
  totalQuantity: Decimal
  totalRevenue: Decimal
  totalCost: Decimal
}

interface CalendarDay {
  dateKey: string
  dayNumber: number
  orderCount: number
  isCurrentMonth: boolean
}

const navigation: Array<{ key: ViewKey; label: string; icon: IconName }> = [
  { key: 'dashboard', label: '首頁', icon: 'dashboard' },
  { key: 'sales', label: '銷售', icon: 'sales' },
  { key: 'orders', label: '訂單', icon: 'orders' },
  { key: 'inventory', label: '庫存', icon: 'inventory' },
  { key: 'reports', label: '報表', icon: 'reports' },
  { key: 'settings', label: '設定', icon: 'settings' },
]

const defaultInventoryForm = {
  name: '',
  unit: '個',
  stock: '0',
  reorderLevel: '0',
  cost: '0',
  price: '0',
}

const decimal = (value: Decimal.Value) => {
  try {
    return new Decimal(value || 0)
  } catch {
    return new Decimal(0)
  }
}

const isDecimalInput = (value: string) => {
  if (value.trim() === '') return false

  try {
    return new Decimal(value).isFinite()
  } catch {
    return false
  }
}

const isPositiveInput = (value: string) => isDecimalInput(value) && decimal(value).gt(0)
const isNonNegativeInput = (value: string) => isDecimalInput(value) && !decimal(value).isNegative()
const money = (value: Decimal.Value) => `NT$ ${decimal(value).toDecimalPlaces(0).toNumber().toLocaleString('zh-TW')}`
const quantity = (value: Decimal.Value) => decimal(value).toDecimalPlaces(3).toString()
const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const localDateKey = (value: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date(value))
const formatDateTime = (value: string) => new Intl.DateTimeFormat('zh-TW', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value))
const formatDateLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Taipei',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}
const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long',
    timeZone: 'Asia/Taipei',
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)))
}
const shiftMonthKey = (monthKey: string, offset: number) => {
  const [yearValue, monthValue] = monthKey.split('-').map(Number)
  const totalMonths = yearValue * 12 + (monthValue - 1) + offset
  const year = Math.floor(totalMonths / 12)
  const month = totalMonths - year * 12 + 1
  return `${year}-${String(month).padStart(2, '0')}`
}
const buildCalendarDays = (monthKey: string, ordersByDate: Map<string, HistoricalOrder[]>): CalendarDay[] => {
  const [year, month] = monthKey.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const firstWeekday = firstDay.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_value, index) => {
    const dayOffset = index - firstWeekday + 1
    const date = new Date(Date.UTC(year, month - 1, dayOffset))
    const dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

    return {
      dateKey,
      dayNumber: date.getUTCDate(),
      orderCount: ordersByDate.get(dateKey)?.length ?? 0,
      isCurrentMonth: date.getUTCMonth() === month - 1,
    }
  })
}

const getDraftReservedAmount = (items: DraftSaleItem[], productId: string) => (
  items.reduce((sum, item) => item.productId === productId ? sum.plus(item.amount) : sum, decimal(0))
)
const formatOrderCode = (orderId: string) => orderId.replace(/-/g, '').slice(0, 8).toUpperCase()
const getOrderHistory = (movements: StockMovement[]) => Array.from(movements.reduce((map, movement) => {
  if (movement.type !== 'sale') return map

  const orderKey = movement.orderId ?? movement.id
  const current = map.get(orderKey) ?? {
    id: orderKey,
    createdAt: movement.createdAt,
    items: [],
    totalQuantity: decimal(0),
    totalRevenue: decimal(0),
    totalCost: decimal(0),
  }

  current.items.push(movement)
  current.totalQuantity = current.totalQuantity.plus(decimal(movement.quantity).abs())
  current.totalRevenue = current.totalRevenue.plus(movement.revenue)
  current.totalCost = current.totalCost.plus(movement.costTotal)
  if (new Date(movement.createdAt).getTime() > new Date(current.createdAt).getTime()) {
    current.createdAt = movement.createdAt
  }
  map.set(orderKey, current)

  return map
}, new Map<string, HistoricalOrder>()).values())
  .map((order) => ({
    ...order,
    items: [...order.items].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }))
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

const bytesToBase64 = (contents: Uint8Array) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < contents.length; offset += chunkSize) {
    binary += String.fromCharCode(...contents.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const deliverTextFile = async (fileName: string, contents: string, title: string, description: string) => {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: fileName,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({ title, text: description, url: file.uri, dialogTitle: title })
    return
  }
  downloadBlob(new Blob([contents], { type: 'application/json' }), fileName)
}

const deliverBinaryFile = async (fileName: string, contents: Uint8Array, title: string, description: string) => {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: fileName,
      data: bytesToBase64(contents),
      directory: Directory.Cache,
    })
    await Share.share({ title, text: description, url: file.uri, dialogTitle: title })
    return
  }
  const copy = new Uint8Array(contents)
  downloadBlob(new Blob([copy.buffer], { type: excelMimeType }), fileName)
}

const conversionErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
)
const fileStem = (fileName: string) => fileName.replace(/\.[^.]+$/, '') || '東山庫存資料'

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    sales: (
      <>
        <path d="M4 5h16l-1.3 8.2a3 3 0 0 1-3 2.5H8.3a3 3 0 0 1-3-2.5L4 5Z" />
        <path d="M8 20h.01M16 20h.01M8 9h8" />
      </>
    ),
    orders: (
      <>
        <path d="M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    inventory: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
        <path d="M12 11v10" />
      </>
    ),
    reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 15.4 21 17l-4 4-1.6-2A8 8 0 0 1 13 20v2H9v-2a8 8 0 0 1-2.4-1L5 21l-3-4 2-1.6A8 8 0 0 1 3 13H1V9h2a8 8 0 0 1 1-2.4L2 5l3-3 1.6 2A8 8 0 0 1 9 3V1h4v2a8 8 0 0 1 2.4 1L17 2l4 3-2 1.6A8 8 0 0 1 20 9h2v4h-2a8 8 0 0 1-1 2.4Z" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.8 19h18.4L12 3Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    box: (
      <>
        <path d="m4 7 8-4 8 4-8 4-8-4Z" />
        <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    money: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M8 12h8M12 9v6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    receipt: (
      <>
        <path d="M7 3h10a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    scale: (
      <>
        <path d="M12 3v18M5 7h14M5 7l-3 6h6L5 7ZM19 7l-3 6h6l-3-6Z" />
      </>
    ),
    spark: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" />,
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="m7 7 1 12h8l1-12" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    trend: <path d="m4 16 5-5 4 3 7-8M15 6h5v5" />,
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span className="brand-mark__eye" />
      <span className="brand-mark__bill" />
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string
  value: string
  hint: string
  icon: IconName
  accent: 'orange' | 'green' | 'red' | 'gold'
}) {
  return (
    <article className={`metric-card metric-card--${accent}`}>
      <div className="metric-card__head">
        <span>{label}</span>
        <span className="metric-card__icon">
          <Icon name={icon} size={20} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  )
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <span>
        <Icon name="box" size={28} />
      </span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

function Dashboard({
  data,
  navigate,
  openMovement,
}: {
  data: LocalAppData
  navigate: (view: ViewKey) => void
  openMovement: (type: 'purchase' | 'adjustment', product?: Product) => void
}) {
  const today = localDateKey(new Date().toISOString())
  const todaySales = data.movements.filter((item) => item.type === 'sale' && localDateKey(item.createdAt) === today)
  const revenue = todaySales.reduce((sum, item) => sum.plus(item.revenue), decimal(0))
  const profit = todaySales.reduce((sum, item) => sum.plus(decimal(item.revenue).minus(item.costTotal)), decimal(0))
  const lowStock = data.products.filter((item) => decimal(item.stock).lte(item.reorderLevel))
  const inventoryValue = data.products.reduce((sum, item) => sum.plus(decimal(item.stock).times(item.cost)), decimal(0))

  return (
    <>
      <section className="preview-note preview-note--local" aria-label="資料儲存狀態">
        <span className="preview-note__icon">
          <Icon name="check" size={18} />
        </span>
        <div>
          <strong>目前使用離線資料</strong>
          <span>所有庫存與銷售都先存在這台裝置，送出後會即時更新本機庫存。</span>
        </div>
      </section>

      <section className="metrics" aria-label="今日摘要">
        <MetricCard
          label="今日銷售"
          value={money(revenue)}
          hint={`${todaySales.length} 筆銷售明細`}
          icon="money"
          accent="orange"
        />
        <MetricCard
          label="今日毛利"
          value={money(profit)}
          hint={revenue.gt(0) ? `毛利率 ${profit.div(revenue).times(100).toFixed(1)}%` : '今天還沒有銷售'}
          icon="trend"
          accent="green"
        />
        <MetricCard
          label="低庫存提醒"
          value={`${lowStock.length} 項`}
          hint={lowStock.length ? '建議盡快補貨或盤點' : '目前沒有缺貨風險'}
          icon="alert"
          accent="red"
        />
        <MetricCard
          label="庫存價值"
          value={money(inventoryValue)}
          hint={`共 ${data.products.length} 項商品`}
          icon="box"
          accent="gold"
        />
      </section>

      <section className="quick-actions" aria-labelledby="quick-actions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">快速操作</p>
            <h2 id="quick-actions-title">今天要先做什麼</h2>
          </div>
        </div>
        <div className="quick-actions__grid">
          <button type="button" onClick={() => navigate('sales')}>
            <span className="quick-actions__icon quick-actions__icon--sale">
              <Icon name="plus" />
            </span>
            <span>
              <strong>建立銷售訂單</strong>
              <small>先加入品項，確認完再一起送出</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
          <button type="button" onClick={() => openMovement('purchase')}>
            <span className="quick-actions__icon quick-actions__icon--purchase">
              <Icon name="inventory" />
            </span>
            <span>
              <strong>新增進貨</strong>
              <small>補貨時同步更新平均成本</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
          <button type="button" onClick={() => openMovement('adjustment')}>
            <span className="quick-actions__icon quick-actions__icon--count">
              <Icon name="scale" />
            </span>
            <span>
              <strong>庫存盤點</strong>
              <small>快速修正盤點後的實際數量</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">需要注意</p>
              <h2>低庫存商品</h2>
            </div>
            <button className="text-button" type="button" onClick={() => navigate('inventory')}>
              查看全部 <Icon name="arrow" size={16} />
            </button>
          </div>
          {lowStock.length === 0 ? (
            <EmptyState title="目前沒有低庫存商品">最近的庫存都還在安全範圍內，可以先專心處理銷售。</EmptyState>
          ) : (
            <div className="stock-list">
              {lowStock.slice(0, 4).map((item) => {
                const level = decimal(item.reorderLevel).gt(0)
                  ? Decimal.min(decimal(item.stock).div(item.reorderLevel).times(100), 100).toNumber()
                  : 100

                return (
                  <article className="stock-item" key={item.id}>
                    <div className="stock-item__top">
                      <div className="stock-item__name">
                        <span>{item.name.slice(0, 1)}</span>
                        <div>
                          <strong>{item.name}</strong>
                          <small>安全庫存 {quantity(item.reorderLevel)} {item.unit}</small>
                        </div>
                      </div>
                      <strong className="stock-item__amount">
                        {quantity(item.stock)} {item.unit}
                      </strong>
                    </div>
                    <div className="stock-progress">
                      <span style={{ width: `${level}%` }} />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <p className="eyebrow">最新動態</p>
              <h2>最近異動</h2>
            </div>
            <span className="sync-badge sync-badge--local">
              <span /> 已存到本機
            </span>
          </div>
          {data.movements.length === 0 ? (
            <EmptyState title="還沒有任何異動">
              進貨、銷售或盤點完成之後，這裡就會開始累積紀錄。
            </EmptyState>
          ) : (
            <div className="activity-list">
              {data.movements.slice(0, 5).map((item) => (
                <article className="activity-item" key={item.id}>
                  <span className={`activity-item__icon activity-item__icon--${item.type}`}>
                    <Icon
                      name={item.type === 'purchase' ? 'inventory' : item.type === 'sale' ? 'sales' : 'scale'}
                      size={19}
                    />
                  </span>
                  <div>
                    <strong>
                      {item.type === 'sale' ? '銷售訂單' : item.type === 'purchase' ? '新增進貨' : '庫存盤點'}
                    </strong>
                    <small>
                      {item.productName} {decimal(item.quantity).isPositive() && item.type !== 'sale' ? '+' : ''}
                      {quantity(item.quantity)} {item.unit}
                    </small>
                  </div>
                  <time>{formatDateTime(item.createdAt)}</time>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function SalesPage({
  data,
  showNotice,
  onSubmitOrder,
}: {
  data: LocalAppData
  showNotice: (message: string) => void
  onSubmitOrder: (items: DraftSaleItem[]) => Promise<boolean>
}) {
  const [productId, setProductId] = useState(data.products[0]?.id ?? '')
  const [amount, setAmount] = useState('1')
  const [price, setPrice] = useState(data.products[0]?.price ?? '')
  const [note, setNote] = useState('')
  const [draftItems, setDraftItems] = useState<DraftSaleItem[]>([])

  useEffect(() => {
    if (data.products.length === 0) {
      setProductId('')
      setPrice('')
      return
    }

    if (!data.products.some((item) => item.id === productId)) {
      setProductId(data.products[0].id)
      setPrice(data.products[0].price)
    }
  }, [data.products, productId])

  const product = data.products.find((item) => item.id === productId)
  const reserved = product ? getDraftReservedAmount(draftItems, product.id) : decimal(0)
  const remaining = product ? Decimal.max(decimal(product.stock).minus(reserved), 0) : decimal(0)

  const orderTotal = useMemo(
    () => draftItems.reduce((sum, item) => sum.plus(decimal(item.amount).times(item.unitPrice)), decimal(0)),
    [draftItems],
  )

  const totalQuantity = useMemo(
    () => draftItems.reduce((sum, item) => sum.plus(item.amount), decimal(0)),
    [draftItems],
  )

  const estimatedProfit = useMemo(
    () => draftItems.reduce((sum, item) => {
      const currentProduct = data.products.find((entry) => entry.id === item.productId)
      const unitCost = currentProduct?.cost ?? '0'
      return sum.plus(decimal(item.amount).times(decimal(item.unitPrice).minus(unitCost)))
    }, decimal(0)),
    [data.products, draftItems],
  )

  const selectProduct = (id: string) => {
    setProductId(id)
    setPrice(data.products.find((item) => item.id === id)?.price ?? '')
  }

  const addToDraft = (event: FormEvent) => {
    event.preventDefault()

    if (!product) {
      showNotice('請先選擇商品。')
      return
    }
    if (!isPositiveInput(amount)) {
      showNotice('銷售數量必須大於 0。')
      return
    }
    if (!isNonNegativeInput(price)) {
      showNotice('售價不可小於 0。')
      return
    }
    if (decimal(amount).gt(remaining)) {
      showNotice(`庫存不足，${product.name} 目前最多只能再加入 ${quantity(remaining)} ${product.unit}。`)
      return
    }

    const nextItem: DraftSaleItem = {
      id: uniqueId(),
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      amount: quantity(amount),
      unitPrice: decimal(price).toFixed(2),
      note: note.trim(),
    }

    setDraftItems((current) => [...current, nextItem])
    setAmount('1')
    setNote('')
    showNotice(`${product.name} 已加入訂單清單。`)
  }

  const removeDraftItem = (id: string) => {
    setDraftItems((current) => current.filter((item) => item.id !== id))
    showNotice('已從訂單清單移除品項。')
  }

  const clearDraftItems = () => {
    if (draftItems.length === 0) return
    setDraftItems([])
    showNotice('已清空訂單清單。')
  }

  const submitOrder = async () => {
    if (draftItems.length === 0) {
      showNotice('請先加入至少一個品項。')
      return
    }

    if (await onSubmitOrder(draftItems)) {
      setDraftItems([])
      setAmount('1')
      setNote('')
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">銷售流程</p>
          <h2>建立訂單</h2>
          <p>先把每個品項加入訂單清單，全部確認後再一次送出，庫存才會同步扣除。</p>
        </div>
      </div>

      {data.products.length === 0 ? (
        <EmptyState title="目前沒有可銷售的商品">
          先到庫存頁新增商品，之後才能建立訂單。
        </EmptyState>
      ) : (
        <div className="sales-layout">
          <form className="form-card" onSubmit={addToDraft}>
            <label>
              商品
              <select value={productId} onChange={(event) => selectProduct(event.target.value)}>
                {data.products.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}，庫存 {quantity(item.stock)} {item.unit}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-grid">
              <label>
                銷售數量
                <input
                  required
                  min="0.001"
                  step="0.001"
                  inputMode="decimal"
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                單價（TWD）
                <input
                  required
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  type="number"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>
            </div>

            <label>
              備註
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：少冰、外送、現場客人"
              />
            </label>

            {product && (
              <>
                <p className="form-hint">
                  目前庫存 {quantity(product.stock)} {product.unit}，本單已暫放 {quantity(reserved)} {product.unit}，還可加入 {quantity(remaining)} {product.unit}。
                </p>
                <div className="calculation">
                  <span>
                    本列小計
                    <strong>{money(decimal(amount).times(price))}</strong>
                  </span>
                  <span>
                    預估毛利
                    <strong>{money(decimal(amount).times(decimal(price).minus(product.cost)))}</strong>
                  </span>
                </div>
              </>
            )}

            <button className="primary-button" type="submit">
              確認加入清單
            </button>
          </form>

          <aside className="order-summary">
            <div className="panel__header">
              <div>
                <p className="eyebrow">訂單摘要</p>
                <h2>待送出品項</h2>
              </div>
              <span className="sync-badge sync-badge--local">
                <span /> 尚未扣庫存
              </span>
            </div>

            {draftItems.length === 0 ? (
              <EmptyState title="訂單清單是空的">選好商品與數量後按下「確認加入清單」，右側就會列出本張訂單的內容。</EmptyState>
            ) : (
              <>
                <div className="order-summary__list">
                  {draftItems.map((item) => (
                    <article className="order-summary__item" key={item.id}>
                      <div className="order-summary__main">
                        <strong>{item.productName}</strong>
                        <small>
                          {quantity(item.amount)} {item.unit} × {money(item.unitPrice)}
                        </small>
                        {item.note ? <p>{item.note}</p> : null}
                      </div>
                      <div className="order-summary__side">
                        <strong>{money(decimal(item.amount).times(item.unitPrice))}</strong>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`移除 ${item.productName}`}
                          onClick={() => removeDraftItem(item.id)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="summary-grid">
                  <article>
                    <span>品項數</span>
                    <strong>{draftItems.length} 項</strong>
                  </article>
                  <article>
                    <span>總數量</span>
                    <strong>{quantity(totalQuantity)}</strong>
                  </article>
                  <article>
                    <span>訂單總額</span>
                    <strong>{money(orderTotal)}</strong>
                  </article>
                  <article>
                    <span>預估毛利</span>
                    <strong>{money(estimatedProfit)}</strong>
                  </article>
                </div>

                <div className="order-summary__actions">
                  <button type="button" className="secondary-button" onClick={clearDraftItems}>
                    清空清單
                  </button>
                  <button type="button" className="primary-button" onClick={submitOrder}>
                    送出訂單
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}

function InventoryPage({
  data,
  onAdd,
  onDelete,
  openMovement,
}: {
  data: LocalAppData
  onAdd: (values: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<boolean>
  onDelete: (product: Product) => Promise<boolean>
  openMovement: (type: 'purchase' | 'adjustment', product?: Product) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultInventoryForm)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await onAdd(form)) {
      setForm(defaultInventoryForm)
      setShowForm(false)
    }
  }

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="page-stack">
      <div className="page-heading page-heading--action">
        <div>
          <p className="eyebrow">庫存管理</p>
          <h2>商品清單</h2>
          <p>這裡可以新增商品、刪除商品，也可以直接進貨或盤點。</p>
        </div>
        <button
          className="primary-button primary-button--small"
          type="button"
          onClick={() => setShowForm((value) => !value)}
        >
          <Icon name="plus" size={18} /> 新增商品
        </button>
      </div>

      {showForm ? (
        <form className="form-card" onSubmit={submit}>
          <div className="form-grid">
            <label>
              商品名稱
              <input
                required
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="例如：鴨翅、米血、甜不辣"
              />
            </label>
            <label>
              單位
              <input
                required
                value={form.unit}
                onChange={(event) => update('unit', event.target.value)}
                placeholder="例如：串、包、盒、杯"
              />
            </label>
            <label>
              目前庫存
              <input
                required
                min="0"
                step="0.001"
                inputMode="decimal"
                type="number"
                value={form.stock}
                onChange={(event) => update('stock', event.target.value)}
              />
            </label>
            <label>
              安全庫存
              <input
                required
                min="0"
                step="0.001"
                inputMode="decimal"
                type="number"
                value={form.reorderLevel}
                onChange={(event) => update('reorderLevel', event.target.value)}
              />
            </label>
            <label>
              成本
              <input
                required
                min="0"
                step="0.01"
                inputMode="decimal"
                type="number"
                value={form.cost}
                onChange={(event) => update('cost', event.target.value)}
              />
            </label>
            <label>
              售價
              <input
                required
                min="0"
                step="0.01"
                inputMode="decimal"
                type="number"
                value={form.price}
                onChange={(event) => update('price', event.target.value)}
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            建立商品
          </button>
        </form>
      ) : null}

      {data.products.length === 0 ? (
        <EmptyState title="目前還沒有商品">
          先新增第一個商品後，銷售和報表才會開始累積資料。
        </EmptyState>
      ) : (
        <div className="product-grid">
          {data.products.map((item) => {
            const low = decimal(item.stock).lte(item.reorderLevel)

            return (
              <article className={`product-card ${low ? 'product-card--low' : ''}`} key={item.id}>
                <div className="product-card__head">
                  <span>{item.name.slice(0, 1)}</span>
                  <div>
                    <h3>{item.name}</h3>
                    <small>{low ? '低於安全庫存' : '庫存狀態正常'}</small>
                  </div>
                </div>

                <dl>
                  <div>
                    <dt>目前庫存</dt>
                    <dd>{quantity(item.stock)} {item.unit}</dd>
                  </div>
                  <div>
                    <dt>安全庫存</dt>
                    <dd>{quantity(item.reorderLevel)} {item.unit}</dd>
                  </div>
                  <div>
                    <dt>平均成本</dt>
                    <dd>{money(item.cost)}</dd>
                  </div>
                  <div>
                    <dt>建議售價</dt>
                    <dd>{money(item.price)}</dd>
                  </div>
                </dl>

                <div className="card-actions card-actions--triple">
                  <button type="button" onClick={() => openMovement('purchase', item)}>
                    進貨
                  </button>
                  <button type="button" onClick={() => openMovement('adjustment', item)}>
                    盤點
                  </button>
                  <button type="button" className="button-danger" onClick={() => void onDelete(item)}>
                    刪除
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ReportsPage({ data }: { data: LocalAppData }) {
  const sales = data.movements.filter((item) => item.type === 'sale')
  const revenue = sales.reduce((sum, item) => sum.plus(item.revenue), decimal(0))
  const costs = sales.reduce((sum, item) => sum.plus(item.costTotal), decimal(0))
  const profit = revenue.minus(costs)

  const productSales = Array.from(sales.reduce((map, item) => {
    const current = map.get(item.productId) ?? {
      id: item.productId,
      name: item.productName,
      unit: item.unit,
      amount: decimal(0),
      revenue: decimal(0),
    }

    current.amount = current.amount.plus(decimal(item.quantity).abs())
    current.revenue = current.revenue.plus(item.revenue)
    current.name = item.productName
    current.unit = item.unit
    map.set(item.productId, current)
    return map
  }, new Map<string, {
    id: string
    name: string
    unit: string
    amount: Decimal
    revenue: Decimal
  }>()).values()).sort((a, b) => b.revenue.comparedTo(a.revenue))

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">營運資料</p>
          <h2>銷售報表</h2>
          <p>即使商品後來被刪除，這裡仍會保留歷史銷售與營收統計。</p>
        </div>
      </div>

      <section className="metrics">
        <MetricCard
          label="累積營收"
          value={money(revenue)}
          hint={`${sales.length} 筆銷售明細`}
          icon="money"
          accent="orange"
        />
        <MetricCard
          label="累積成本"
          value={money(costs)}
          hint="以銷售當下成本計算"
          icon="box"
          accent="gold"
        />
        <MetricCard
          label="累積毛利"
          value={money(profit)}
          hint={revenue.gt(0) ? `毛利率 ${profit.div(revenue).times(100).toFixed(1)}%` : '尚未有銷售資料'}
          icon="trend"
          accent="green"
        />
        <MetricCard
          label="總異動數"
          value={`${data.movements.length} 筆`}
          hint="包含進貨、銷售與盤點"
          icon="scale"
          accent="red"
        />
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">排行榜</p>
            <h2>商品銷售</h2>
          </div>
        </div>
        {productSales.length === 0 ? (
          <EmptyState title="目前還沒有銷售資料">
            送出第一張訂單後，這裡就會顯示各品項的營收排行。
          </EmptyState>
        ) : (
          <div className="report-list">
            {productSales.map((item, index) => (
              <div key={item.id}>
                <span>{index + 1}</span>
                <strong>{item.name}</strong>
                <small>{quantity(item.amount)} {item.unit}</small>
                <b>{money(item.revenue)}</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function OrdersPage({ data }: { data: LocalAppData }) {
  const orders = useMemo(() => getOrderHistory(data.movements), [data.movements])
  const totalRevenue = orders.reduce((sum, order) => sum.plus(order.totalRevenue), decimal(0))
  const averageOrderValue = orders.length > 0 ? totalRevenue.div(orders.length) : decimal(0)
  const totalLines = orders.reduce((sum, order) => sum + order.items.length, 0)
  const availableDateKeys = useMemo(
    () => [...new Set(orders.map((order) => localDateKey(order.createdAt)))].sort((a, b) => b.localeCompare(a)),
    [orders],
  )
  const defaultDateKey = availableDateKeys[0] ?? localDateKey(new Date().toISOString())
  const [selectedDateKey, setSelectedDateKey] = useState(defaultDateKey)
  const [visibleMonthKey, setVisibleMonthKey] = useState(defaultDateKey.slice(0, 7))
  const ordersByDate = useMemo(
    () => orders.reduce((map, order) => {
      const dateKey = localDateKey(order.createdAt)
      const current = map.get(dateKey) ?? []
      current.push(order)
      map.set(dateKey, current)
      return map
    }, new Map<string, HistoricalOrder[]>()),
    [orders],
  )
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonthKey, ordersByDate), [visibleMonthKey, ordersByDate])
  const selectedOrders = ordersByDate.get(selectedDateKey) ?? []
  const selectedRevenue = selectedOrders.reduce((sum, order) => sum.plus(order.totalRevenue), decimal(0))
  const selectedQuantity = selectedOrders.reduce((sum, order) => sum.plus(order.totalQuantity), decimal(0))
  const selectedProfit = selectedOrders.reduce((sum, order) => sum.plus(order.totalRevenue.minus(order.totalCost)), decimal(0))

  useEffect(() => {
    if (orders.length === 0) {
      const todayKey = localDateKey(new Date().toISOString())
      setSelectedDateKey(todayKey)
      setVisibleMonthKey(todayKey.slice(0, 7))
      return
    }

    if (!ordersByDate.has(selectedDateKey)) {
      setSelectedDateKey(defaultDateKey)
      setVisibleMonthKey(defaultDateKey.slice(0, 7))
    }
  }, [defaultDateKey, orders.length, ordersByDate, selectedDateKey])

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">銷售記錄</p>
          <h2>歷史訂單</h2>
          <p>這裡會列出從銷售頁成功送出的訂單，每張訂單都會保留品項、數量與金額。</p>
        </div>
      </div>

      <section className="metrics">
        <MetricCard
          label="歷史訂單"
          value={`${orders.length} 張`}
          hint={`${totalLines} 筆訂單明細`}
          icon="receipt"
          accent="orange"
        />
        <MetricCard
          label="選取日期訂單"
          value={`${selectedOrders.length} 張`}
          hint={formatDateLabel(selectedDateKey)}
          icon="sales"
          accent="green"
        />
        <MetricCard
          label="當日營收"
          value={money(selectedRevenue)}
          hint={selectedOrders.length > 0 ? `共售出 ${quantity(selectedQuantity)}` : '這一天尚未有訂單'}
          icon="money"
          accent="gold"
        />
        <MetricCard
          label="平均客單"
          value={money(averageOrderValue)}
          hint={orders.length > 0 ? '以每張訂單平均計算' : '尚未建立任何訂單'}
          icon="trend"
          accent="red"
        />
      </section>

      {orders.length === 0 ? (
        <EmptyState title="目前還沒有歷史訂單">
          從銷售頁送出第一張訂單後，這裡就會自動顯示訂單內容。
        </EmptyState>
      ) : (
        <div className="orders-layout">
          <section className="calendar-panel">
            <div className="calendar-panel__header">
              <div>
                <p className="eyebrow">日期篩選</p>
                <h2>{formatMonthLabel(visibleMonthKey)}</h2>
              </div>
              <div className="calendar-panel__actions">
                <button
                  type="button"
                  className="calendar-nav-button"
                  aria-label="上一個月"
                  onClick={() => setVisibleMonthKey((current) => shiftMonthKey(current, -1))}
                >
                  <Icon name="arrow" size={16} />
                </button>
                <button
                  type="button"
                  className="calendar-nav-button calendar-nav-button--next"
                  aria-label="下一個月"
                  onClick={() => setVisibleMonthKey((current) => shiftMonthKey(current, 1))}
                >
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </div>

            <div className="calendar-grid" role="grid" aria-label={`${formatMonthLabel(visibleMonthKey)} 訂單月曆`}>
              {weekdayLabels.map((weekday) => (
                <span className="calendar-weekday" key={weekday}>
                  {weekday}
                </span>
              ))}
              {calendarDays.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  className={`calendar-day${day.isCurrentMonth ? '' : ' is-outside'}${day.dateKey === selectedDateKey ? ' is-selected' : ''}${day.orderCount > 0 ? ' has-orders' : ''}`}
                  onClick={() => {
                    setSelectedDateKey(day.dateKey)
                    setVisibleMonthKey(day.dateKey.slice(0, 7))
                  }}
                  aria-pressed={day.dateKey === selectedDateKey}
                >
                  <strong>{day.dayNumber}</strong>
                  <small>{day.orderCount > 0 ? `${day.orderCount} 張` : '無訂單'}</small>
                </button>
              ))}
            </div>
          </section>

          <div className="page-stack">
            <section className="selected-date-card">
              <div className="panel__header">
                <div>
                  <p className="eyebrow">選取日期</p>
                  <h2>{formatDateLabel(selectedDateKey)}</h2>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSelectedDateKey(defaultDateKey)
                    setVisibleMonthKey(defaultDateKey.slice(0, 7))
                  }}
                >
                  回到最新訂單日
                </button>
              </div>
              <div className="history-order-summary">
                <article>
                  <span>當日訂單</span>
                  <strong>{selectedOrders.length} 張</strong>
                </article>
                <article>
                  <span>當日數量</span>
                  <strong>{quantity(selectedQuantity)}</strong>
                </article>
                <article>
                  <span>當日營收</span>
                  <strong>{money(selectedRevenue)}</strong>
                </article>
                <article>
                  <span>當日毛利</span>
                  <strong>{money(selectedProfit)}</strong>
                </article>
              </div>
            </section>

            {selectedOrders.length === 0 ? (
              <EmptyState title="這一天還沒有訂單">
                換一天點看看，或先從銷售頁建立新訂單，這裡就會自動出現。
              </EmptyState>
            ) : (
              <div className="history-order-list">
                {selectedOrders.map((order) => {
                  const orderProfit = order.totalRevenue.minus(order.totalCost)

                  return (
                    <article className="history-order-card" key={order.id}>
                      <div className="history-order-card__header">
                        <div>
                          <p className="eyebrow">訂單 #{formatOrderCode(order.id)}</p>
                          <h3>共 {order.items.length} 項商品</h3>
                          <small>{formatDateTime(order.createdAt)}</small>
                        </div>
                        <span className="order-badge">已送出</span>
                      </div>

                      <div className="history-order-items">
                        {order.items.map((item) => (
                          <div className="history-order-item" key={item.id}>
                            <div className="history-order-item__main">
                              <strong>{item.productName}</strong>
                              <small>
                                {quantity(decimal(item.quantity).abs())} {item.unit} × {money(item.unitPrice)}
                              </small>
                              {item.note ? <p>{item.note}</p> : null}
                            </div>
                            <strong>{money(item.revenue)}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="history-order-summary">
                        <article>
                          <span>總數量</span>
                          <strong>{quantity(order.totalQuantity)}</strong>
                        </article>
                        <article>
                          <span>訂單金額</span>
                          <strong>{money(order.totalRevenue)}</strong>
                        </article>
                        <article>
                          <span>訂單成本</span>
                          <strong>{money(order.totalCost)}</strong>
                        </article>
                        <article>
                          <span>訂單毛利</span>
                          <strong>{money(orderProfit)}</strong>
                        </article>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function SettingsPage({
  data,
  onExport,
  onImport,
  onExportExcel,
  onJsonToExcel,
  onExcelToJson,
}: {
  data: LocalAppData
  onExport: () => Promise<void>
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onExportExcel: () => Promise<void>
  onJsonToExcel: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onExcelToJson: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const jsonToExcelRef = useRef<HTMLInputElement>(null)
  const excelToJsonRef = useRef<HTMLInputElement>(null)

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">資料管理</p>
          <h2>備份與還原</h2>
          <p>建議定期匯出 JSON 備份，換裝置或清除瀏覽資料後可以快速還原。</p>
        </div>
      </div>

      <section className="settings-card">
        <div className="settings-card__icon">
          <Icon name="check" size={26} />
        </div>
        <div>
          <h3>目前使用 IndexedDB</h3>
          <p>目前共有 {data.products.length} 個商品與 {data.movements.length} 筆異動紀錄儲存在本機。</p>
          <small>
            最近一次備份：
            {data.lastBackupAt
              ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.lastBackupAt))
              : '尚未備份'}
          </small>
        </div>
      </section>

      <section className="backup-grid">
        <button type="button" onClick={onExport}>
          <Icon name="box" />
          <strong>匯出 JSON 備份</strong>
          <small>下載目前的商品、庫存與銷售資料，之後可以再匯回。</small>
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          <Icon name="clock" />
          <strong>匯入備份</strong>
          <small>選取先前匯出的 JSON 檔案，完整覆蓋目前本機資料。</small>
        </button>
      </section>

      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={onImport}
      />

      <div className="settings-subheading">
        <p className="eyebrow">Excel 轉換工具</p>
        <h3>Excel 與 JSON 雙向轉換</h3>
        <p>Excel 內含商品庫存、所有紀錄與歷史訂單摘要，轉回 JSON 後可使用上方的匯入備份還原。</p>
      </div>

      <section className="backup-grid backup-grid--excel">
        <button type="button" onClick={onExportExcel}>
          <Icon name="reports" />
          <strong>目前資料匯出 Excel</strong>
          <small>直接下載目前裝置內的庫存與歷史訂單 Excel 活頁簿。</small>
        </button>
        <button type="button" onClick={() => jsonToExcelRef.current?.click()}>
          <Icon name="arrow" />
          <strong>JSON 轉 Excel</strong>
          <small>選取網站匯出的 JSON 備份，轉成可用 Excel 開啟的 .xlsx 檔。</small>
        </button>
        <button type="button" onClick={() => excelToJsonRef.current?.click()}>
          <Icon name="receipt" />
          <strong>Excel 轉 JSON</strong>
          <small>選取本工具產生的 Excel，驗證內容後下載網站可匯入的 JSON。</small>
        </button>
      </section>

      <input
        ref={jsonToExcelRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={onJsonToExcel}
      />
      <input
        ref={excelToJsonRef}
        className="visually-hidden"
        type="file"
        accept={`${excelMimeType},.xlsx`}
        onChange={onExcelToJson}
      />

      <div className="warning-box">
        <Icon name="alert" size={20} />
        <p>
          <strong>注意：</strong>
          Excel 轉 JSON 不會立即修改網站資料；只有按下「匯入備份」並確認後，才會覆蓋目前裝置上的資料。
        </p>
      </div>
    </section>
  )
}

function MovementDialog({
  data,
  initialType,
  initialProduct,
  close,
  save,
}: {
  data: LocalAppData
  initialType: 'purchase' | 'adjustment'
  initialProduct?: Product
  close: () => void
  save: (type: 'purchase' | 'adjustment', productId: string, value: string, cost: string, note: string) => Promise<boolean>
}) {
  const [type, setType] = useState(initialType)
  const [productId, setProductId] = useState(initialProduct?.id ?? data.products[0]?.id ?? '')
  const [value, setValue] = useState(initialType === 'purchase' ? '1' : (initialProduct?.stock ?? '0'))
  const [cost, setCost] = useState(initialProduct?.cost ?? data.products[0]?.cost ?? '0')
  const [note, setNote] = useState('')

  const product = data.products.find((item) => item.id === productId)

  const changeType = (next: 'purchase' | 'adjustment') => {
    setType(next)
    setValue(next === 'purchase' ? '1' : (product?.stock ?? '0'))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (await save(type, productId, value, cost, note)) {
      close()
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="movement-title">
        <div className="modal__head">
          <div>
            <p className="eyebrow">庫存異動</p>
            <h2 id="movement-title">{type === 'purchase' ? '新增進貨' : '庫存盤點'}</h2>
          </div>
          <button type="button" aria-label="關閉" onClick={close}>×</button>
        </div>

        {data.products.length === 0 ? (
          <EmptyState title="目前沒有商品">先新增商品之後，才能記錄進貨或盤點。</EmptyState>
        ) : (
          <form onSubmit={submit}>
            <div className="segmented">
              <button className={type === 'purchase' ? 'is-active' : ''} type="button" onClick={() => changeType('purchase')}>
                進貨
              </button>
              <button className={type === 'adjustment' ? 'is-active' : ''} type="button" onClick={() => changeType('adjustment')}>
                盤點
              </button>
            </div>

            <label>
              商品
              <select
                value={productId}
                onChange={(event) => {
                  const item = data.products.find((entry) => entry.id === event.target.value)
                  setProductId(event.target.value)
                  setCost(item?.cost ?? '0')
                  if (type === 'adjustment') {
                    setValue(item?.stock ?? '0')
                  }
                }}
              >
                {data.products.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {type === 'purchase' ? '進貨數量' : '盤點後庫存'}
              <input
                required
                min="0"
                step="0.001"
                inputMode="decimal"
                type="number"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>

            {type === 'purchase' ? (
              <label>
                進貨單價
                <input
                  required
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  type="number"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                />
              </label>
            ) : null}

            <label>
              備註
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={type === 'purchase' ? '例如：供應商、批次、叫貨單' : '例如：盤點差異、報廢、調整原因'}
              />
            </label>

            {product ? (
              <p className="form-hint">
                目前庫存 {quantity(product.stock)} {product.unit}
              </p>
            ) : null}

            <button className="primary-button" type="submit">
              儲存異動
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [data, setData] = useState<LocalAppData | null>(null)
  const [notice, setNotice] = useState('')
  const [movement, setMovement] = useState<{ type: 'purchase' | 'adjustment'; product?: Product } | null>(null)
  const noticeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    loadLocalData().then(setData).catch(() => setNotice('讀取本機資料失敗。'))

    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [])

  const today = useMemo(
    () => new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()),
    [],
  )

  const currentLabel = navigation.find((item) => item.key === activeView)?.label ?? '首頁'

  const showNotice = (message: string) => {
    setNotice(message)
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 2600)
  }

  const persist = async (next: LocalAppData, message: string) => {
    try {
      await saveLocalData(next)
      setData(next)
      showNotice(message)
      return true
    } catch {
      showNotice('儲存失敗，請再試一次。')
      return false
    }
  }

  const addProduct = async (values: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!data) return false

    if (data.products.some((item) => item.name.trim() === values.name.trim())) {
      showNotice('已經有同名商品，請改用其他名稱。')
      return false
    }

    if ([values.stock, values.reorderLevel, values.cost, values.price].some((value) => !isNonNegativeInput(value))) {
      showNotice('庫存、成本與售價都必須是 0 以上的數字。')
      return false
    }

    const now = new Date().toISOString()
    const product: Product = {
      ...values,
      name: values.name.trim(),
      unit: values.unit.trim(),
      stock: quantity(values.stock),
      reorderLevel: quantity(values.reorderLevel),
      cost: decimal(values.cost).toFixed(2),
      price: decimal(values.price).toFixed(2),
      id: uniqueId(),
      createdAt: now,
      updatedAt: now,
    }

    return persist({ ...data, products: [...data.products, product] }, `已新增商品：${product.name}`)
  }

  const deleteProduct = async (product: Product) => {
    if (!data) return false

    const confirmed = window.confirm(`確定要刪除「${product.name}」嗎？既有銷售紀錄會保留，但之後不能再從庫存或銷售中選到它。`)
    if (!confirmed) return false

    if (movement?.product?.id === product.id) {
      setMovement(null)
    }

    return persist(
      { ...data, products: data.products.filter((item) => item.id !== product.id) },
      `已刪除商品：${product.name}`,
    )
  }

  const submitSaleOrder = async (items: DraftSaleItem[]) => {
    if (!data) return false
    if (items.length === 0) {
      showNotice('請先加入至少一個品項。')
      return false
    }

    const productsById = new Map(data.products.map((item) => [item.id, item]))
    const requestedByProduct = new Map<string, Decimal>()

    for (const item of items) {
      const product = productsById.get(item.productId)
      if (!product) {
        showNotice(`找不到商品：${item.productName}。請重新選擇後再送出。`)
        return false
      }
      if (!isPositiveInput(item.amount)) {
        showNotice(`商品 ${item.productName} 的數量格式不正確。`)
        return false
      }
      if (!isNonNegativeInput(item.unitPrice)) {
        showNotice(`商品 ${item.productName} 的售價格式不正確。`)
        return false
      }

      requestedByProduct.set(
        item.productId,
        (requestedByProduct.get(item.productId) ?? decimal(0)).plus(item.amount),
      )
    }

    for (const [productId, requestedAmount] of requestedByProduct) {
      const product = productsById.get(productId)
      if (!product) continue

      if (requestedAmount.gt(product.stock)) {
        showNotice(`庫存不足：${product.name} 目前只有 ${quantity(product.stock)} ${product.unit}。`)
        return false
      }
    }

    const now = new Date().toISOString()
    const orderId = uniqueId()

    const movements: StockMovement[] = items.map((item) => {
      const product = productsById.get(item.productId)!
      const sold = quantity(item.amount)
      return {
        id: uniqueId(),
        orderId,
        type: 'sale',
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: decimal(sold).negated().toString(),
        unitPrice: decimal(item.unitPrice).toFixed(2),
        unitCost: product.cost,
        revenue: decimal(sold).times(item.unitPrice).toFixed(2),
        costTotal: decimal(sold).times(product.cost).toFixed(2),
        note: item.note.trim(),
        createdAt: now,
      }
    })

    const products = data.products.map((item) => {
      const requested = requestedByProduct.get(item.id)
      if (!requested) return item

      return {
        ...item,
        stock: quantity(decimal(item.stock).minus(requested)),
        updatedAt: now,
      }
    })

    return persist(
      { ...data, products, movements: [...movements, ...data.movements] },
      `訂單已建立，已送出 ${items.length} 項商品。`,
    )
  }

  const saveMovement = async (
    type: 'purchase' | 'adjustment',
    productId: string,
    value: string,
    cost: string,
    note: string,
  ) => {
    if (!data) return false

    const product = data.products.find((item) => item.id === productId)
    if (!product) {
      showNotice('找不到指定商品。')
      return false
    }
    if (!isNonNegativeInput(value) || (type === 'purchase' && !isPositiveInput(value))) {
      showNotice('請輸入正確的庫存數量。')
      return false
    }
    if (type === 'purchase' && !isNonNegativeInput(cost)) {
      showNotice('進貨成本不可小於 0。')
      return false
    }

    const now = new Date().toISOString()
    const change = type === 'purchase' ? decimal(value) : decimal(value).minus(product.stock)
    const newStock = type === 'purchase' ? decimal(product.stock).plus(value) : decimal(value)
    const nextCost = type === 'purchase' && newStock.gt(0)
      ? decimal(product.stock).times(product.cost).plus(decimal(value).times(cost)).div(newStock).toFixed(2)
      : product.cost

    const movementItem: StockMovement = {
      id: uniqueId(),
      type,
      productId,
      productName: product.name,
      unit: product.unit,
      quantity: change.toString(),
      unitPrice: '0.00',
      unitCost: type === 'purchase' ? decimal(cost).toFixed(2) : product.cost,
      revenue: '0.00',
      costTotal: decimal(change).times(type === 'purchase' ? cost : product.cost).toFixed(2),
      note: note.trim(),
      createdAt: now,
    }

    const products = data.products.map((item) => item.id === productId
      ? {
        ...item,
        stock: quantity(newStock),
        cost: nextCost,
        updatedAt: now,
      }
      : item)

    return persist(
      { ...data, products, movements: [movementItem, ...data.movements] },
      type === 'purchase' ? `已新增 ${product.name} 的進貨紀錄。` : `已更新 ${product.name} 的盤點結果。`,
    )
  }

  const exportBackup = async () => {
    if (!data) return

    try {
      const backupAt = new Date().toISOString()
      const next = { ...data, lastBackupAt: backupAt }
      await deliverTextFile(
        `東山庫存備份-${localDateKey(backupAt)}.json`,
        JSON.stringify(next, null, 2),
        '東山庫存 JSON 備份',
        '已產生最新的 JSON 備份檔。',
      )
      await persist(next, 'JSON 備份已匯出。')
    } catch (error) {
      showNotice(conversionErrorMessage(error, 'JSON 備份匯出失敗。'))
    }
  }

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !data) return

    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isLocalAppData(parsed)) throw new Error('invalid')
      if (!window.confirm('匯入後會覆蓋目前本機資料，確定要繼續嗎？')) return
      await persist(parsed, '備份已成功匯入。')
    } catch {
      showNotice('備份檔格式錯誤，無法匯入。')
    }
  }

  const exportExcel = async () => {
    if (!data) return

    try {
      const backupAt = new Date().toISOString()
      const next = { ...data, lastBackupAt: backupAt }
      const { createExcelBackup } = await import('./excelBackup')
      const contents = await createExcelBackup(next)
      await deliverBinaryFile(
        `東山庫存資料-${localDateKey(backupAt)}.xlsx`,
        contents,
        '東山庫存 Excel',
        '已產生包含庫存、紀錄及歷史訂單的 Excel 活頁簿。',
      )
      await persist(next, 'Excel 已匯出。')
    } catch (error) {
      showNotice(conversionErrorMessage(error, 'Excel 匯出失敗。'))
    }
  }

  const convertJsonToExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isLocalAppData(parsed)) throw new Error('JSON 備份格式錯誤，無法轉換。')
      const { createExcelBackup } = await import('./excelBackup')
      const contents = await createExcelBackup(parsed)
      await deliverBinaryFile(
        `${fileStem(file.name)}.xlsx`,
        contents,
        'JSON 轉 Excel',
        'JSON 備份已轉換成 Excel 活頁簿。',
      )
      showNotice('JSON 已成功轉換成 Excel。')
    } catch (error) {
      showNotice(conversionErrorMessage(error, 'JSON 轉 Excel 失敗。'))
    }
  }

  const convertExcelToJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const { parseExcelBackup } = await import('./excelBackup')
      const converted = await parseExcelBackup(await file.arrayBuffer())
      await deliverTextFile(
        `${fileStem(file.name)}.json`,
        JSON.stringify(converted, null, 2),
        'Excel 轉 JSON',
        'Excel 已轉換成網站可匯入的 JSON 備份。',
      )
      showNotice('Excel 已成功轉換成 JSON 備份。')
    } catch (error) {
      showNotice(conversionErrorMessage(error, 'Excel 轉 JSON 失敗。'))
    }
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <BrandMark />
        <strong>正在載入本機資料…</strong>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>東山庫存</strong>
            <small>離線進貨與銷售管理</small>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主要導覽">
          {navigation.map((item) => (
            <button
              type="button"
              className={activeView === item.key ? 'is-active' : ''}
              onClick={() => setActiveView(item.key)}
              key={item.key}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span>
            <Icon name="check" size={17} />
          </span>
          <div>
            <strong>資料已存在本機</strong>
            <small>離線也能正常操作</small>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div>
            <p className="topbar__mobile-label">{currentLabel}</p>
            <h1>{activeView === 'dashboard' ? '今天的營運概況' : currentLabel}</h1>
            <p>{activeView === 'dashboard' ? today : '東山庫存離線管理系統'}</p>
          </div>
          <button
            type="button"
            className="profile-button"
            aria-label="前往設定"
            onClick={() => setActiveView('settings')}
          >
            <span>資料設定</span>
            <strong>
              <Icon name="settings" size={20} />
            </strong>
          </button>
        </header>

        <main className="content">
          {activeView === 'dashboard' ? (
            <Dashboard data={data} navigate={setActiveView} openMovement={(type, product) => setMovement({ type, product })} />
          ) : null}
          {activeView === 'sales' ? (
            <SalesPage data={data} showNotice={showNotice} onSubmitOrder={submitSaleOrder} />
          ) : null}
          {activeView === 'orders' ? <OrdersPage data={data} /> : null}
          {activeView === 'inventory' ? (
            <InventoryPage
              data={data}
              onAdd={addProduct}
              onDelete={deleteProduct}
              openMovement={(type, product) => setMovement({ type, product })}
            />
          ) : null}
          {activeView === 'reports' ? <ReportsPage data={data} /> : null}
          {activeView === 'settings' ? (
            <SettingsPage
              data={data}
              onExport={exportBackup}
              onImport={importBackup}
              onExportExcel={exportExcel}
              onJsonToExcel={convertJsonToExcel}
              onExcelToJson={convertExcelToJson}
            />
          ) : null}
        </main>

        <nav className="bottom-nav" aria-label="底部導覽">
          {navigation.map((item) => (
            <button
              type="button"
              className={activeView === item.key ? 'is-active' : ''}
              onClick={() => setActiveView(item.key)}
              key={item.key}
            >
              <Icon name={item.icon} size={21} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {movement ? (
        <MovementDialog
          data={data}
          initialType={movement.type}
          initialProduct={movement.product}
          close={() => setMovement(null)}
          save={saveMovement}
        />
      ) : null}

      <div className={`toast ${notice ? 'toast--visible' : ''}`} role="status" aria-live="polite">
        <Icon name="clock" size={18} /> {notice}
      </div>
    </div>
  )
}

export default App

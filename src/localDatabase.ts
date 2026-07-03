import Decimal from 'decimal.js'
import { z } from 'zod'

export type MovementType = 'sale' | 'purchase' | 'adjustment'

export interface Product {
  id: string
  name: string
  unit: string
  stock: string
  reorderLevel: string
  cost: string
  price: string
  createdAt: string
  updatedAt: string
}

export interface StockMovement {
  id: string
  type: MovementType
  productId: string
  productName: string
  unit: string
  quantity: string
  unitPrice: string
  unitCost: string
  revenue: string
  costTotal: string
  note: string
  createdAt: string
}

export interface LocalAppData {
  version: 1
  products: Product[]
  movements: StockMovement[]
  lastBackupAt: string | null
}

const DATABASE_NAME = 'dongshan-inventory'
const STORE_NAME = 'app-data'
const DATA_KEY = 'main'

const decimalStringSchema = z.string().refine((value) => {
  if (value.trim() === '') return false

  try {
    return new Decimal(value).isFinite()
  } catch {
    return false
  }
}, '必須是有效的十進位數字字串')

const timestampSchema = z.string().datetime()

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1),
  stock: decimalStringSchema,
  reorderLevel: decimalStringSchema,
  cost: decimalStringSchema,
  price: decimalStringSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict()

const stockMovementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['sale', 'purchase', 'adjustment']),
  productId: z.string().min(1),
  productName: z.string().min(1),
  unit: z.string().min(1),
  quantity: decimalStringSchema,
  unitPrice: decimalStringSchema,
  unitCost: decimalStringSchema,
  revenue: decimalStringSchema,
  costTotal: decimalStringSchema,
  note: z.string(),
  createdAt: timestampSchema,
}).strict()

const localAppDataSchema = z.object({
  version: z.literal(1),
  products: z.array(productSchema),
  movements: z.array(stockMovementSchema),
  lastBackupAt: timestampSchema.nullable(),
}).strict()

const emptyData = (): LocalAppData => ({
  version: 1,
  products: [],
  movements: [],
  lastBackupAt: null,
})

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('無法開啟本機資料庫'))
  })
}

export async function loadLocalData(): Promise<LocalAppData> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(DATA_KEY)

    request.onsuccess = () => {
      if (request.result === undefined) {
        resolve(emptyData())
        return
      }

      const parsed = localAppDataSchema.safeParse(request.result)
      if (parsed.success) {
        resolve(parsed.data)
      } else {
        reject(new Error('本機資料格式無效，請從有效備份還原'))
      }
    }
    request.onerror = () => reject(request.error ?? new Error('無法讀取本機資料'))
    transaction.oncomplete = () => database.close()
  })
}

export async function saveLocalData(data: LocalAppData): Promise<void> {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(data, DATA_KEY)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('無法儲存本機資料'))
    }
  })
}

export function isLocalAppData(value: unknown): value is LocalAppData {
  return localAppDataSchema.safeParse(value).success
}

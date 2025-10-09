import { Array, Effect } from "effect"
import { Result, Atom } from "@effect-atom/atom-react"

export const updateFailsAtom = Atom.make(false)

interface Todo {
  readonly id: number
  readonly text: string
}

class TodosRepo extends Effect.Service<TodosRepo>()("TodosRepo", {
  accessors: true,
  scoped: Effect.gen(function* () {
    let currentId = 0
    let todos = Array.empty<Todo>()

    const nextId = Effect.sync(() => ++currentId)

    const simulateNetwork = Effect.gen(function* () {
      yield* Effect.sleep(1000)
      const shouldFail = yield* Atom.get(updateFailsAtom)
      if (shouldFail) {
        return yield* Effect.fail(new Error("Update failed"))
      }
    })

    const add = Effect.fn(function* (todo: Todo) {
      console.log("TodosRepo.add", todo)
      yield* simulateNetwork
      todos = Array.append(todos, todo)
    })

    const remove = Effect.fn(function* (id: number) {
      console.log("TodosRepo.remove", id)
      yield* simulateNetwork
      todos = Array.filter(todos, (t) => t.id !== id)
    })

    return {
      nextId,
      add,
      remove,
      all: Effect.sync(() => {
        console.log("TodosRepo.all")
        return todos
      }),
    }
  }),
}) {
  static runtime = Atom.runtime(TodosRepo.Default)
}

export const todosAtomReadonly = TodosRepo.runtime
  .atom(TodosRepo.all)
  .pipe(Atom.map(Result.getOrElse(Array.empty<Todo>)))

export const todosAtom = Atom.optimistic(todosAtomReadonly)

const addTodoAtom = Atom.optimisticFn(todosAtom, {
  reducer(current, todo: Todo) {
    console.log("optimisticAddTodosAtom", todo)
    return [...current, todo]
  },
  fn: TodosRepo.runtime.fn((todo) => TodosRepo.add(todo), { concurrent: true }),
})

export const addTodoString = TodosRepo.runtime.fn(
  Effect.fnUntraced(function* (text: string, get: Atom.FnContext) {
    const id = yield* TodosRepo.nextId
    get.set(addTodoAtom, { id, text })
    return yield* get.result(addTodoAtom)
  }),
)

export const removeTodoAtom = Atom.family((id: number) =>
  Atom.optimisticFn(todosAtom, {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    reducer(current, _: void) {
      console.log("optimisticRemoveTodosAtom", id)
      return current.filter((t) => t.id !== id)
    },
    fn: TodosRepo.runtime.fn(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Effect.fnUntraced(function* (_) {
        console.log("removeTodoAtom", id)
        yield* TodosRepo.remove(id)
      }),
      { concurrent: true },
    ),
  }),
)

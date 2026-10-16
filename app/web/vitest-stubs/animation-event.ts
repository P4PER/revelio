// jsdom has no AnimationEvent, but since jsdom 29 its style object knows
// WebkitAnimation. React picks its animationend listener name once, at load:
// without AnimationEvent it skips the unprefixed name and, finding
// WebkitAnimation, listens for webkitAnimationEnd - so onAnimationEnd never
// fires for an "animationend". Every browser has AnimationEvent; this restores
// the browser's choice. Listed first in setupFiles: it must run before
// anything imports react-dom. A file under @vitest-environment node has no
// window at all, and nothing there to fix.
if (typeof window !== 'undefined' && !('AnimationEvent' in window)) {
  class AnimationEvent extends Event {
    readonly animationName: string
    readonly elapsedTime: number
    readonly pseudoElement: string
    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init)
      this.animationName = init.animationName ?? ''
      this.elapsedTime = init.elapsedTime ?? 0
      this.pseudoElement = init.pseudoElement ?? ''
    }
  }
  Object.defineProperty(window, 'AnimationEvent', { value: AnimationEvent, configurable: true, writable: true })
}

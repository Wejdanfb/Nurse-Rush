/**
 * All DOM: screens, HUD, cinematic overlay, question card, result screens.
 * The game logic never touches the DOM directly - it calls these methods.
 */

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      loading: $('loading'),
      loaderFill: $('loader-fill'),
      menu: $('menu'),
      menuBest: $('menu-best'),
      howto: $('howto'),
      introUI: $('intro-ui'),
      alert: $('alert-banner'),
      caption: $('intro-caption'),
      hud: $('hud'),
      timerBox: $('hud-timer'),
      timerValue: $('timer-value'),
      timerFill: $('timer-fill'),
      score: $('hud-score'),
      coins: $('hud-coins'),
      questions: $('hud-questions'),
      speedLabel: $('speed-label'),
      speedFill: $('speed-fill'),
      toasts: $('toast-stack'),
      finishFlash: $('finish-flash'),
      question: $('question'),
      qBadge: $('q-badge'),
      qTag: $('q-tag'),
      qText: $('q-text'),
      qOptions: $('q-options'),
      qFeedback: $('q-feedback'),
      qClock: $('q-clock'),
      qClockWrap: document.querySelector('.qcard__clock'),
      qClockFill: $('q-clockfill'),
      victory: $('victory'),
      winScore: $('win-score'),
      winCoins: $('win-coins'),
      winCorrect: $('win-correct'),
      winBest: $('win-best'),
      gameover: $('gameover'),
      loseScore: $('lose-score'),
      loseCoins: $('lose-coins'),
      loseCorrect: $('lose-correct'),
      loseBest: $('lose-best'),
      loseReason: $('lose-reason'),
      loseReview: $('lose-review'),
      reviewQ: $('review-question'),
      reviewChosen: $('review-chosen'),
      reviewCorrect: $('review-correct'),
      reviewExplain: $('review-explain'),
      soundState: $('sound-state'),
      rotate: $('rotate'),
    };

    // full-screen fade used for the intro hand-off
    this.fade = document.createElement('div');
    Object.assign(this.fade.style, {
      position: 'fixed', inset: '0', background: '#06202e', opacity: '0',
      pointerEvents: 'none', zIndex: '55', transition: 'none',
    });
    document.body.appendChild(this.fade);

    this._lastScore = 0;
  }

  // ---------------- screens ----------------
  show(name) {
    for (const key of ['loading', 'menu', 'howto', 'victory', 'gameover', 'rotate']) {
      this.el[key].classList.toggle('is-active', key === name);
    }
  }

  hideAllScreens() { this.show(null); }

  setHud(on) {
    this.el.hud.classList.toggle('is-active', on);
    document.body.classList.toggle('is-playing', on);
  }

  setIntroUI(on) {
    this.el.introUI.classList.toggle('is-active', on);
  }

  setLoaderProgress(p) {
    this.el.loaderFill.style.width = `${Math.round(Math.max(4, p * 100))}%`;
  }

  // ---------------- cinematic ----------------
  setCineBars(on) {
    this.el.introUI.classList.toggle('is-closing', !on);
  }

  showAlert(on) {
    this.el.alert.classList.toggle('is-on', on);
  }

  setIntroCaption(text) {
    if (!text) {
      this.el.caption.classList.remove('is-on');
      return;
    }
    this.el.caption.textContent = text;
    this.el.caption.classList.add('is-on');
  }

  setFade(k) {
    this.fade.style.opacity = String(Math.max(0, Math.min(1, k)));
  }

  flash() {
    const f = this.el.finishFlash;
    f.classList.remove('is-on');
    void f.offsetWidth;
    f.classList.add('is-on');
  }

  // ---------------- HUD ----------------
  setTimer(remaining, total) {
    const r = Math.max(0, remaining);
    const m = Math.floor(r / 60);
    const s = Math.floor(r % 60);
    this.el.timerValue.textContent = `${m}:${String(s).padStart(2, '0')}`;
    this.el.timerFill.style.width = `${(r / total) * 100}%`;
    this.el.timerBox.classList.toggle('is-urgent', r <= 15);
  }

  setScore(v) {
    if (v !== this._lastScore) {
      this.el.score.textContent = String(v);
      this._lastScore = v;
      const chip = this.el.score.closest('.chip');
      chip.classList.remove('is-bump');
      void chip.offsetWidth;
      chip.classList.add('is-bump');
    }
  }

  setCoins(v) { this.el.coins.textContent = String(v); }

  setQuestionsDone(n) { this.el.questions.textContent = `${n}/2`; }

  setSpeed(tier, label) {
    this.el.speedLabel.textContent = label;
    this.el.speedFill.style.width = `${Math.round(((tier + 1) / 6) * 100)}%`;
  }

  toast(text, kind = 'good') {
    const d = document.createElement('div');
    d.className = `toast toast--${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 1050);
  }

  // ---------------- question card ----------------
  /**
   * @param {object} q prepared question (shuffled options)
   * @param {number} index 0 or 1
   * @param {(optionIndex:number)=>void} onAnswer
   */
  showQuestion(q, index, onAnswer) {
    const el = this.el;
    el.qBadge.textContent = `QUESTION ${index + 1} OF 2`;
    el.qTag.textContent = q.type === 'tf' ? `SBAR · TRUE OR FALSE · ${q.id}` : `SBAR · MULTIPLE CHOICE · ${q.id}`;
    el.qText.textContent = q.type === 'tf' ? `True or False: ${q.text}` : q.text;

    el.qOptions.innerHTML = '';
    el.qOptions.className = `qcard__options ${q.type === 'tf' ? 'is-tf' : 'is-mcq'}`;
    el.qFeedback.className = 'qcard__feedback';
    el.qFeedback.innerHTML = '';

    this.optionButtons = q.options.map((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.type = 'button';
      const key = document.createElement('span');
      key.className = 'opt__key';
      key.textContent = String.fromCharCode(65 + i);
      const txt = document.createElement('span');
      txt.textContent = opt.text;
      b.append(key, txt);
      b.addEventListener('click', () => onAnswer(i));
      el.qOptions.appendChild(b);
      return b;
    });

    el.question.classList.add('is-active');
  }

  setQuestionClock(remaining, total) {
    const r = Math.max(0, remaining);
    this.el.qClock.textContent = String(Math.ceil(r));
    this.el.qClockFill.style.width = `${(r / total) * 100}%`;
    this.el.qClockWrap.classList.toggle('is-low', r <= 3.5);
  }

  /** Reveal the result on the card. */
  revealAnswer(q, chosenIndex, correctIndex) {
    this.optionButtons.forEach((b, i) => {
      b.disabled = true;
      if (i === correctIndex) b.classList.add('is-correct');
      else if (i === chosenIndex) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });

    const right = chosenIndex === correctIndex;
    const fb = this.el.qFeedback;
    fb.className = `qcard__feedback is-on ${right ? 'is-good' : 'is-bad'}`;
    fb.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = right
      ? 'Correct  ·  +100 points'
      : chosenIndex < 0 ? 'Time up  ·  shift failed' : 'Incorrect  ·  shift failed';
    const p = document.createElement('span');
    p.textContent = q.explanation;
    fb.append(b, p);
  }

  hideQuestion() {
    this.el.question.classList.remove('is-active');
  }

  // ---------------- results ----------------
  showVictory({ score, coins, best }) {
    this.el.winScore.textContent = String(score);
    this.el.winCoins.textContent = String(coins);
    this.el.winCorrect.textContent = '2/2';
    this.el.winBest.textContent = String(best);
    this.show('victory');
  }

  showGameOver({ score, coins, best, correct, reason, review }) {
    this.el.loseScore.textContent = String(score);
    this.el.loseCoins.textContent = String(coins);
    this.el.loseCorrect.textContent = `${correct}/2`;
    this.el.loseBest.textContent = String(best);
    this.el.loseReason.textContent = reason || '';

    if (review) {
      this.el.loseReview.classList.add('is-on');
      this.el.reviewQ.textContent = review.type === 'tf'
        ? `${review.id} — True or False: ${review.text}`
        : `${review.id} — ${review.text}`;
      this.el.reviewChosen.innerHTML = '';
      const cb = document.createElement('b');
      cb.textContent = review.chosen ? 'Your answer' : 'No answer given';
      this.el.reviewChosen.append(cb);
      if (review.chosen) {
        this.el.reviewChosen.append(document.createTextNode(review.chosen));
      } else {
        this.el.reviewChosen.append(document.createTextNode('The 10-second limit ran out.'));
      }
      this.el.reviewCorrect.innerHTML = '';
      const gb = document.createElement('b');
      gb.textContent = 'Correct answer';
      this.el.reviewCorrect.append(gb, document.createTextNode(review.correct));
      this.el.reviewExplain.textContent = review.explanation;
    } else {
      this.el.loseReview.classList.remove('is-on');
    }

    this.show('gameover');
  }

  setMenuBest(best, wins, rounds) {
    if (!best) {
      this.el.menuBest.textContent = rounds ? 'No score yet — survive the shift!' : '';
      return;
    }
    this.el.menuBest.textContent = `Best score ${best}  ·  shifts survived ${wins}/${rounds}`;
  }

  setSoundLabel(on) {
    this.el.soundState.textContent = on ? 'ON' : 'OFF';
  }
}

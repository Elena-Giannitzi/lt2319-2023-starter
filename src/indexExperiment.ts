import { createMachine, createActor, assign } from "xstate";
import { speechstate, Settings, Hypothesis } from "speechstate";
import { fromPromise } from 'xstate';

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: "ad818b0cdae94e4ea41aec30f7342a73",
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  asrDefaultCompleteTimeout: 0,
  locale: "en-US",
  asrDefaultNoInputTimeout: 5000,
  ttsDefaultVoice: "en-GB-RyanNeural",
};


interface DMContext {
  spstRef?: any;
  lastResult?: Hypothesis[];
  // name: any;
}

//chat gpt keys:
async function fetchFromChatGPT(prompt: string, max_tokens: number) {
  const myHeaders = new Headers();
  myHeaders.append(
    "Authorization",
    "Bearer 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",
  );
  myHeaders.append("Content-Type", "application/json");
  const raw = JSON.stringify({
    model: "gpt-4-0125-preview",
    messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
    temperature: 0.1,
    max_tokens: max_tokens,
  });

  const response = fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  })
    .then((response) => response.json())
    .then((response) => response.choices[0].message.content);

  return response;
}

//attempting to have it keep memory
async function fetchFromChatGPTMemory(prompt: string, lastGPTutterance: string, newUtterance: string, max_tokens: number) {
  const myHeaders = new Headers();
  myHeaders.append(
    "Authorization",
    "Bearer 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",
  );
  myHeaders.append("Content-Type", "application/json");
  const raw = JSON.stringify({
    model: "gpt-4-0125-preview",
    messages: [
            {
              role: "user",
              content: prompt,
            },
            {
              role: "system",
              content: lastGPTutterance,
            },
            {
              role: "user",
              content: newUtterance,
            },
          ],
    temperature: 0.1,
    max_tokens: max_tokens,
  });

  const response = fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: myHeaders,
    body: raw,
    redirect: "follow",
  })
    .then((response) => response.json())
    .then((response) => response.choices[0].message.content);

  return response;
}

async function playAudioFromURL(audioURL) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioURL);
    audio.addEventListener('ended', resolve);
    audio.addEventListener('error', reject);
    audio.play().catch(reject);
  });
}

const say =
  (text: string) =>
  ({ context }) => {
    context.spstRef.send({
      type: "SPEAK",
      value: { utterance: text },
    });
  };
const listen =
  () =>
  ({ context }) =>
    context.spstRef.send({
      type: "LISTEN",
    });

// machine
const dmMachine = createMachine(
  {
    id: "root",
    type: "parallel",
    states: {
      DialogueManager: {
        initial: "Prepare",
        states: {
          Prepare: {
            on: { ASRTTS_READY: "Ready" },
            entry: [
              assign({
                spstRef: ({ spawn }) => {
                  return spawn(speechstate, {
                    input: {
                      settings: settings, 
                    },
                  });
                },
              }),
            ],
          },
          Ready: {
            initial: "Greeting",
            states: {
              Greeting: {
                entry: "speak.greeting", //greeting state
                on: { SPEAK_COMPLETE: "GetName" }, //move to ask for name from here 
              },
              GetName: {
                entry: say("But before we begin, how shall I call you?"),
                on: { SPEAK_COMPLETE: "AskName" },
              },
              AskName: {
                entry: listen(),
                on: {
                  RECOGNISED: {
                    target: "Greet", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        username: ({event}) => event.value[0].utterance.replace(/\.$/g, "").replace("i'm ","").replace("i am ","").replace("my name is ","") || "my new friend",
                      }),
                    ],
                  },
                },
              },
              Backchannel: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `Huh`},
                  });
                },
                on: { SPEAK_COMPLETE: "Greet" },
              },
              Greet: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `So ${context.username}, nice to meet you! Please select one of the following topics to talk about: 1. "Which one tells a story better: Books or Movies?", 2. "Saturday plans: Going out or staying in?", or 3. "Buying a gift for a friend".`},
                  });
                },
                on: { SPEAK_COMPLETE: "ChooseTopic" },
              },
              //move to askUniverse
              ChooseTopic: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                  {
                    target: "BooksVsMoviesNegotiation",
                    guard: ({event}) => {
                      const u = event.value[0].utterance.toLowerCase().replace(/\.$/g, "")
                      if (u.includes("books") || u.includes("movies") || u.includes("movie") || u.includes("book") || u.includes("first") || u.includes("number one")) {
                        return true
                      }
                      return false
                    },
                    actions: [({ event }) => console.log(event.output),
                  ],
                  },
                  {
                    target: "InAndOutNegotiation",
                    guard: ({event}) => {
                      const u = event.value[0].utterance.toLowerCase().replace(/\.$/g, "")
                      if (u.includes("going out") || u.includes("staying in") || u.includes("inside") || u.includes("outdoors") || u.includes("saturday") || u.includes("plans") || u.includes("take out") || u.includes("number two") || u.includes("second") || u.includes("indoors")) {
                        return true
                      }
                      return false
                    },
                    actions: [({ event }) => console.log(event.output),
                  ],
                  },
                  {
                    target: "GiftNegotiation",
                    guard: ({event}) => {
                      const u = event.value[0].utterance.toLowerCase().replace(/\.$/g, "")
                      if (u.includes("friend") || u.includes("buy") || u.includes("get") || u.includes("present") || u.includes("gift") || u.includes("presents") || u.includes("gifts") || u.includes("third") || u.includes("number three")) {
                        return true
                      }
                      return false
                    },
                    actions: [({ event }) => console.log(event.output),
                  ],
                  },
                  {
                    target: "ExplainBooksVsMovies",
                    guard: ({event}) => {
                      const u = event.value[0].utterance.toLowerCase().replace(/\.$/g, "")
                      if (u.includes("i don't know") || u.includes("you can choose") || u.includes("you choose") || u.includes("you pick") || u.includes("your choice") || u.includes("i'm not sure") || u.includes("you can pick") || u.includes("you can select") || u.includes("pick") || u.includes("choose") || u.includes("select")) {
                        return true
                      }
                      return false
                    },
                    actions: [({ event }) => console.log(event.output)]
                  },
                  {
                    target: "noMatchIntro",
                    actions: [({ event }) => console.log(event.output)]
                    },
                  ],
                },
              },
              noMatchIntro: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I didn't hear that sorry, can you say it again?`},
                  });
                },
                on: { SPEAK_COMPLETE: "ChooseTopic" },
              },
              //states:
              BooksVsMoviesNegotiation: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `Oh I was hoping you'd choose that one.`},
                  });
                },
                on: { SPEAK_COMPLETE: "LaughBook1" },
              },
              LaughBook1: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "ExplainBooksVsMovies",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchIntro",
                  },
                },
              },
              InAndOutNegotiation: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `Hmm`},
                  });
                },
                on: { SPEAK_COMPLETE: "ExplainInNOut" },
              },
              GiftNegotiation: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `Giving away presents huh? Let's see!`},
                  });
                },
                on: { SPEAK_COMPLETE: "ExplainGift" },
              },
              ExplainBooksVsMovies: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `A lot of movies are based on books, but maybe one is better than the other! So ${context.username} books or movies?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase1" },
              },
              BooksVsMoviesPhase1: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase1GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                    {
                      target: "noMatch"
                    },
                  ],
                },
              },
              noMatch: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase1" },
              },
              BooksVsMoviesPhase1GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  " + input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                    }),
                  onDone: {
                    target: "Filler",
                    actions: [
                      assign({ 
                        answer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook1",
                  },
                },
              },
              noMatchBook1: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase1" },
              },
              Filler: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Um...I see."},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase1GPTReply" },
              },
              BooksVsMoviesPhase1GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.answer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase2" },
              },
              //2
              BooksVsMoviesPhase2: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase2GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase2GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.answer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      answer: context.answer,
                    }),
                  onDone: {
                    target: "Filler2",
                    actions: [
                      assign({ 
                        secondanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook2",
                  },
                },
              },
              noMatchBook2: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase2" },
              },
              Filler2: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Uh"},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase2GPTReply" },
              },
              BooksVsMoviesPhase2GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.secondanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase3" },
              },
              //3
              BooksVsMoviesPhase3: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase3GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase3GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.secondanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      secondanswer: context.secondanswer,
                    }),
                  onDone: {
                    target: "Filler3",
                    actions: [
                      assign({ 
                        thirdanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook3",
                  },
                },
              },
              noMatchBook3: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase3" },
              },
              Filler3: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Oh"},
                  });
                },
                on: { SPEAK_COMPLETE: "LaughBook3" },
              },
              LaughBook3: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "BooksVsMoviesPhase3GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchBook3",
                  },
                },
              },
              BooksVsMoviesPhase3GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.thirdanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase4" },
              },
              //4
              BooksVsMoviesPhase4: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase4GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase4GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.thirdanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      thirdanswer: context.thirdanswer,
                    }),
                  onDone: {
                    target: "Filler4",
                    actions: [
                      assign({ 
                        forthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook4",
                  },
                },
              },
              noMatchBook4: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase4" },
              },
              Filler4: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Well..."},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase4GPTReply" },
              },
              BooksVsMoviesPhase4GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.forthanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase5" },
              },
              //5
              BooksVsMoviesPhase5: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase5GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase5GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.forthanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      forthanswer: context.forthanswer
                    }),
                  onDone: {
                    target: "Filler5",
                    actions: [
                      assign({ 
                        fifthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook5",
                  },
                },
              },
              noMatchBook5: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase5" },
              },
              Filler5: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Huh I hear you there but..."},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase5GPTReply" },
              },
              BooksVsMoviesPhase5GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.answer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase6" },
              },
              //6
              BooksVsMoviesPhase6: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase6GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase6GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.fifthanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      fifthanswer: context.fifthanswer,
                    }),
                  onDone: {
                    target: "Filler6",
                    actions: [
                      assign({ 
                        sixthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook6",
                  },
                },
              },
              noMatchBook6: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase6" },
              },
              Filler6: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "I see your point, however..."},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase6GPTReply" },
              },
              BooksVsMoviesPhase6GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.sixthanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase7" },
              },
              //7
              BooksVsMoviesPhase7: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase7GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase7GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.sixthanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      sixthanswer: context.sixthanswer,
                    }),
                  onDone: {
                    target: "LaughBook7",
                    actions: [
                      assign({ 
                        seventhanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook7",
                  },
                },
              },
              noMatchBook7: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase7" },
              },
              LaughBook7: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "BooksVsMoviesPhase7GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchBook7",
                  },
                },
              },
              BooksVsMoviesPhase7GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.seventhanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase8" },
              },
              //8
              BooksVsMoviesPhase8: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase8GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase8GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.seventhanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      seventhanswer: context.seventhanswer,
                    }),
                  onDone: {
                    target: "BooksVsMoviesPhase8GPTReply",
                    actions: [
                      assign({ 
                        eigthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook8",
                  },
                },
              },
              noMatchBook8: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase8" },
              },
              BooksVsMoviesPhase8GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.eigthanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase9" },
              },
              //9
              BooksVsMoviesPhase9: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase9GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase9GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.eigthanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      eigthanswer: context.eigthanswer,
                    }),
                  onDone: {
                    target: "Filler9",
                    actions: [
                      assign({ 
                        ninthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook9",
                  },
                },
              },
              noMatchBook9: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase9" },
              },
              Filler9: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Uh"},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase9GPTReply" },
              },
              BooksVsMoviesPhase9GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.ninthanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase10" },
              },
              //10
              BooksVsMoviesPhase10: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "BooksVsMoviesPhase10GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              BooksVsMoviesPhase10GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Is reading the book better than watching the movie? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ", input.ninthanswer, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      ninthanswer: context.ninthanswer,
                    }),
                  onDone: {
                    target: "LaughBook10",
                    actions: [
                      assign({ 
                        tenthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchBook10",
                  },
                },
              },
              noMatchBook10: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesPhase10" },
              },
              LaughBook10: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "BooksVsMoviesPhase10GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchBook10",
                  },
                },
              },
              BooksVsMoviesPhase10GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.tenthanswer},
                  });
                },
                on: { SPEAK_COMPLETE: "BooksVsMoviesFinished" },
              },
              BooksVsMoviesFinished: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `Wow ${context.username}. Let's just agree to disagree.`},
                  });
                },
                on: { SPEAK_COMPLETE: "Goodbye" },
              },
              //SECONF TOPIC - INDOORS AND OUTDOORS
              ExplainInNOut: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Spending time with friends is great for the soul and mind; But are outdoor activities better than indoors?"},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase1" },
              },
              InNOutPhase1: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase1GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                    {
                      target: "noMatchInNOut"
                    },
                  ],
                },
              },
              noMatchInNOut: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase1" },
              },
              InNOutPhase1GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                    }),
                  onDone: {
                    target: "FillerInNOut1",
                    actions: [
                      assign({ 
                        answerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut1",
                  },
                },
              },
              noMatchInNOut1: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase1" },
              },
              FillerInNOut1: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Huh"},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase1GPTReply" },
              },
              InNOutPhase1GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.answerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase2" },
              },
              //2
              InNOutPhase2: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase2GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase2GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.answerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      answerInNOut: context.answerInNOut
                    }),
                  onDone: {
                    target: "Filler2InNOut",
                    actions: [
                      assign({ 
                        secondanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut2",
                  },
                },
              },
              noMatchInNOut2: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase2" },
              },
              Filler2InNOut: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Uh"},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase2GPTReply" },
              },
              InNOutPhase2GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.secondanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase3" },
              },
              //3
              InNOutPhase3: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase3GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase3GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.secondanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      secondanswerInNOut: context.secondanswerInNOut
                    }),
                  onDone: {
                    target: "Filler3InNOut",
                    actions: [
                      assign({ 
                        thirdanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut3",
                  },
                },
              },
              noMatchInNOut3: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase3" },
              },
              Filler3InNOut: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Oh"},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase3GPTReply" },
              },
              InNOutPhase3GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.thirdanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase4" },
              },
              //4
              InNOutPhase4: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase4GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase4GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.thirdanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      thirdanswerInNOut: context.thirdanswerInNOut
                    }),
                  onDone: {
                    target: "LaughInNOut4",
                    actions: [
                      assign({ 
                        forthanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut4",
                  },
                },
              },
              noMatchInNOut4: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase4" },
              },
              LaughInNOut4: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "InNOutPhase4GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut4",
                  },
                },
              },
              InNOutPhase4GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.forthanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase5" },
              },
              //5
              InNOutPhase5: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase5GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase5GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.forthanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      forthanswerInNOut: context.forthanswerInNOut,
                    }),
                  onDone: {
                    target: "Filler5InNOut",
                    actions: [
                      assign({ 
                        fifthanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut5",
                  },
                },
              },
              noMatchInNOut5: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase5" },
              },
              Filler5InNOut: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Well..."},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase5GPTReply" },
              },
              InNOutPhase5GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.answerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase6" },
              },
              //6
              InNOutPhase6: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase6GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase6GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.fifthanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      fifthanswerInNOut: context.fifthanswerInNOut,
                    }),
                  onDone: {
                    target: "LaughInNOut6",
                    actions: [
                      assign({ 
                        sixthanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut6",
                  },
                },
              },
              noMatchInNOut6: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase6" },
              },
              LaughInNOut6: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "InNOutPhase6GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut6",
                  },
                },
              },
              InNOutPhase6GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.sixthanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase7" },
              },
              //7
              InNOutPhase7: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase7GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase7GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.sixthanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      sixthanswerInNOut: context.sixthanswerInNOut,
                    }),
                  onDone: {
                    target: "FillerInNOut7",
                    actions: [
                      assign({ 
                        seventhanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut7",
                  },
                },
              },
              noMatchInNOut7: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase7" },
              },
              FillerInNOut7: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Um"},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase7GPTReply" },
              },
              InNOutPhase7GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.seventhanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase8" },
              },
              //8
              InNOutPhase8: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase8GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase8GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.seventhanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      seventhanswerInNOut: context.seventhanswerInNOut,
                    }),
                  onDone: {
                    target: "InNOutPhase8GPTReply",
                    actions: [
                      assign({ 
                        eigthanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut8",
                  },
                },
              },
              noMatchInNOut8: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase8" },
              },
              InNOutPhase8GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.eigthanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase9" },
              },
              //9
              InNOutPhase9: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase9GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase9GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.eigthanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      eigthanswerInNOut : context.eigthanswerInNOut
                    }),
                  onDone: {
                    target: "LaughInNOut9",
                    actions: [
                      assign({ 
                        ninthanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut9",
                  },
                },
              },
              noMatchInNOut9: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase9" },
              },
              LaughInNOut9: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "InNOutPhase9GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut9",
                  },
                },
              },
              InNOutPhase9GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.ninthanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase10" },
              },
              //10
              InNOutPhase10: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "InNOutPhase10GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              InNOutPhase10GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Are outdoor activities better than indoors? Task: continue the debate by giving an OPPOSITE statement AND DISAGREE from this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.ninthanswerInNOut, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      ninthanswerInNOut: context.ninthanswerInNOut
                    }),
                  onDone: {
                    target: "FillerInNOut10",
                    actions: [
                      assign({ 
                        tenthanswerInNOut: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchInNOut10",
                  },
                },
              },
              noMatchInNOut10: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase10" },
              },
              FillerInNOut10: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Okay okay"},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutPhase10GPTReply" },
              },
              InNOutPhase10GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.tenthanswerInNOut},
                  });
                },
                on: { SPEAK_COMPLETE: "InNOutFinished" },
              },
              InNOutFinished: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `Wow ${context.username}. Those were some interesting opinions!`},
                  });
                },
                on: { SPEAK_COMPLETE: "Goodbye" },
              },
              //THIRD TOPIC - GIFT FOR A FRIEND:
              ExplainGift: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Buying a gift for a friend can be quite challenging. What would make the perfect present?"},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase1" },
              },
              GiftPhase1: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase1GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                    {
                      target: "noMatchGift"
                    },
                  ],
                },
              },
              noMatchGift: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase1" },
              },
              GiftPhase1GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                    }),
                  onDone: {
                    target: "LaughGift1",
                    actions: [
                      assign({ 
                        answergift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift1",
                  },
                },
              },
              noMatchGift1: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase1" },
              },
              LaughGift1: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "GiftPhase1GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchGift1",
                  },
                },
              },
              GiftPhase1GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.answergift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase2" },
              },
              //2
              GiftPhase2: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase2GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase2GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory("Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS): ", input.answergift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      answergift: context.answergift,
                    }),
                  onDone: {
                    target: "Filler2Gift",
                    actions: [
                      assign({ 
                        secondanswergift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift2",
                  },
                },
              },
              noMatchGift2: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase2" },
              },
              Filler2Gift: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Uh"},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase2GPTReply" },
              },
              GiftPhase2GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.secondanswergift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase3" },
              },
              //3
              GiftPhase3: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase3GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase3GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.secondanswergift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      secondanswergift: context.secondanswergift,
                    }),
                  onDone: {
                    target: "Filler3Gift",
                    actions: [
                      assign({ 
                        thirdanswergift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift3",
                  },
                },
              },
              noMatchGift3: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase3" },
              },
              Filler3Gift: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Oh"},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase3GPTReply" },
              },
              GiftPhase3GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.thirdanswergift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase4" },
              },
              //4
              GiftPhase4: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase4GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase4GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.thirdanswergift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      thirdanswergift: context.thirdanswergift,
                    }),
                  onDone: {
                    target: "LaughGift4",
                    actions: [
                      assign({ 
                        forthanswergift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift4",
                  },
                },
              },
              noMatchGift4: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase4" },
              },
              LaughGift4: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "GiftPhase4GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchGift4",
                  },
                },
              },
              GiftPhase4GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.forthanswergift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase5" },
              },
              //5
              GiftPhase5: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase5GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase5GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.forthanswergift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      forthanswergift: context.forthanswergift,
                    }),
                  onDone: {
                    target: "Filler5Gift",
                    actions: [
                      assign({ 
                        fifthanswergift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift5",
                  },
                },
              },
              noMatchGift5: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase5" },
              },
              Filler5Gift: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Well..."},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase5GPTReply" },
              },
              GiftPhase5GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.answergift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase6" },
              },
              //6
              GiftPhase6: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase6GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase6GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.fifthanswergift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      fifthanswergift: context.fifthanswergift,
                    }),
                  onDone: {
                    target: "FillerGift6",
                    actions: [
                      assign({ 
                        sixthanswergift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift6",
                  },
                },
              },
              noMatchGift6: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase6" },
              },
              FillerGift6: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "I see your point, however..."},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase6GPTReply" },
              },
              GiftPhase6GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.sixthanswergift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase7" },
              },
              //7
              GiftPhase7: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase7GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase7GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.sixthanswerGift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      sixthanswergift: context.sixthanswergift,
                    }),
                  onDone: {
                    target: "FillerGift7",
                    actions: [
                      assign({ 
                        seventhanswerGift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift7",
                  },
                },
              },
              noMatchGift7: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase7" },
              },
              FillerGift7: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Huh"},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase7GPTReply" },
              },
              GiftPhase7GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.seventhanswerGift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase8" },
              },
              //8
              GiftPhase8: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase8GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase8GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.seventhanswerGift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      seventhanswerGift: context.seventhanswerGift
                    }),
                  onDone: {
                    target: "LaughGift8",
                    actions: [
                      assign({ 
                        eigthanswerGift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift8",
                  },
                },
              },
              noMatchGift8: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase8" },
              },
              LaughGift8: {
                invoke: {
                  src: fromPromise(async () => {
                    await playAudioFromURL("https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav");
                    return "Audio playback complete";
                  }),
                  onDone: {
                    target: "GiftPhase8GPTReply",
                    actions: [({ event }) => console.log(event.output),
                    ],
                  },
                  onError: {
                    target: "noMatchGift8",
                  },
                },
              },
              GiftPhase8GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.eigthanswerGift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase9" },
              },
              //9
              GiftPhase9: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase9GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase9GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.eigthanswerGift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      eigthanswerGift: context.eigthanswerGift,
                    }),
                  onDone: {
                    target: "FillerGift9",
                    actions: [
                      assign({ 
                        ninthanswerGift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift9",
                  },
                },
              },
              noMatchGift9: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase9" },
              },
              FillerGift9: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Uh"},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase9GPTReply" },
              },
              GiftPhase9GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.ninthanswerGift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase10" },
              },
              //10
              GiftPhase10: {
                entry: listen(),
                on: {
                  RECOGNISED: [
                    {
                      target: "GiftPhase10GPT", 
                    actions: [
                      ({ event }) => console.log(event),
                      assign({
                        lastResult: ({ event }) => event.value,
                      }),
                    ],
                    },
                  ],
                },
              },
              GiftPhase10GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPTMemory(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  `, input.ninthanswerGift, input.lastResult[0].utterance, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      ninthanswerGift: context.ninthanswerGift
                    }),
                  onDone: {
                    target: "FillerGift10",
                    actions: [
                      assign({ 
                        tenthanswerGift: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "noMatchGift10",
                  },
                },
              },
              noMatchGift10: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm sorry ${context.username} I couldn't understand that correctly, could you please repeat it?`},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase10" },
              },
              FillerGift10: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "Okay okay"},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftPhase10GPTReply" },
              },
              GiftPhase10GPTReply: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: context.tenthanswerGift},
                  });
                },
                on: { SPEAK_COMPLETE: "GiftFinished" },
              },
              GiftFinished: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I still believe they will like my present more than yours ${context.username}`},
                  });
                },
                on: { SPEAK_COMPLETE: "Goodbye" },
              },
              //FINAL STATES
              Goodbye: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: "That was so much fun! Thank you for participating!"},
                  });
                },
                on: { SPEAK_COMPLETE: "IdleEnd" },
              },
              IdleEnd: {
                entry: "GUI.PageLoaded",
              },
            },
          },
        },
      },
      GUI: {
        initial: "PageLoaded",
        states: {
          PageLoaded: {
            entry: "gui.PageLoaded",
            on: { CLICK: { target: "Inactive", actions: "prepare" } },
          },
          Inactive: { entry: "gui.Inactive", on: { ASRTTS_READY: "Active" } },
          Active: {
            initial: "Idle",
            states: {
              Idle: {
                entry: "gui.Idle",
                on: { TTS_STARTED: "Speaking", ASR_STARTED: "Listening" },
              },
              Speaking: {
                entry: "gui.Speaking",
                on: { SPEAK_COMPLETE: "Idle" },
              },
              Listening: { entry: "gui.Listening", on: { RECOGNISED: "Idle" } },
            },
          },
        },
      },
    },
  },
  {
    // custom actions
    //
    actions: {
      prepare: ({ context }) =>
        context.spstRef.send({
          type: "PREPARE",
        }),
      // saveLastResult:
      "speak.greeting": ({ context }) => {
        context.spstRef.send({
          type: "SPEAK",
          value: { utterance: "Hello and welcome to today's experiment!" },
        });
      },
      "speak.how-can-I-help": ({ context }) =>
        context.spstRef.send({
          type: "SPEAK",
          value: { utterance: "How can I help you?" },
        }),
        CookBook: ({ context }) => {
            window.open(`https://www.cookingclassy.com/?s=${context.what}`,"_blank")
        },
      "gui.PageLoaded": ({}) => {
        document.getElementById("button").innerText = "Click to start!";
        document.querySelector(".animation-speaking").classList.remove("active");
        document.querySelector(".animation-listening").classList.remove("active");
        document.querySelector(".animation-speaking").classList.add("hidden");
        document.querySelector(".animation-listening").classList.add("hidden");
      },
      "gui.Inactive": ({}) => {
        document.getElementById("button").innerText = "Inactive";
        document.querySelector(".animation-speaking").classList.remove("active");
        document.querySelector(".animation-listening").classList.remove("active");
        document.querySelector(".animation-speaking").classList.add("hidden");
        document.querySelector(".animation-listening").classList.add("hidden");
      },
      "gui.Idle": ({}) => {
        document.getElementById("button").innerText = "Idle";
        document.querySelector(".animation-speaking").classList.remove("active");
        document.querySelector(".animation-listening").classList.remove("active");
        document.querySelector(".animation-speaking").classList.add("hidden");
        document.querySelector(".animation-listening").classList.remove("hidden");
      },
      "gui.Speaking": ({}) => {
        document.getElementById("button").innerText = "Speaking...";
        document.getElementById("button").className = "speakWave";
        document.querySelector(".animation-speaking").classList.add("active");
        document.querySelector(".animation-speaking").classList.remove("hidden");
        document.querySelector(".animation-listening").classList.remove("active");
        document.querySelector(".animation-listening").classList.add("hidden");
      },
      "gui.Listening": ({}) => {
        document.getElementById("button").innerText = "Listening...";
        document.getElementById("button").className = "listening";
        document.querySelector(".animation-speaking").classList.remove("active");
        document.querySelector(".animation-speaking").classList.add("hidden");
        document.querySelector(".animation-listening").classList.add("active");
        document.querySelector(".animation-listening").classList.remove("hidden");
      },
      "gui.AudioPlaying": ({}) => {
        document.getElementById("button").innerText = "Playing audio...";
        document.getElementById("button").className = "speakWave";
        document.querySelector(".animation-speaking").classList.add("active");
        document.querySelector(".animation-speaking").classList.remove("hidden");
        document.querySelector(".animation-listening").classList.remove("active");
        document.querySelector(".animation-listening").classList.add("hidden");
        // Add any other necessary GUI updates for audio playback
      },
    },
  },
);

const actor = createActor(dmMachine).start();

document.getElementById("button").onclick = () => actor.send({ type: "CLICK" });


actor.subscribe((state) => {
  console.log(state.value);
});



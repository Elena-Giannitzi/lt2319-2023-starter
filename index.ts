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

//audio link: 'https://furhat-audio.s3.eu-north-1.amazonaws.com/chuckleMan.wav';

const sayAsync = async (text:string) => {
  return async ({ context }) => {
    context.spstRef.send({
      type: "SPEAK",
      value: { utterance: text },
    });
  };
};

const listenAsync = async () => {
  return async ({ context }) => {
    context.spstRef.send({
      type: "LISTEN",
    });
  };
};

//chat gpt keys:

async function fetchFromChatGPT(prompt: string, max_tokens: number) {
  const myHeaders = new Headers();
  myHeaders.append(
    "Authorization",
    "Bearer <key>",
  );
  myHeaders.append("Content-Type", "application/json");
  const raw = JSON.stringify({
    model: "gpt-3.5-turbo",
    messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
    temperature: 0.2,
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
                on: { SPEAK_COMPLETE: "Next" }, //move to ask for name from here 
              },
              //new states for lab 1
              //SELECT A LANGUAGE
              Next: {
                invoke: {
                  id: "Next",
                  src: fromPromise(async () => {
                    return sayAsync("I'm happy to hear you're participating in today's experiment!");
                  }),
                  onDone: {
                    target: "Smile",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              Smile: {
                invoke: {
                  id: "Smile",
                  src: fromPromise(async () => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "Welcome",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              Welcome: {
                invoke: {
                  id: "Welcome",
                  src: fromPromise(async () => {
                    return sayAsync("I would like to officially welcome you all.");
                  }),
                  onDone: {
                    target: "AskName",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              AskName: {
                invoke: {
                  id: "AskName",
                  src: fromPromise(async () => {
                    return sayAsync("But first how shall I call you?");
                  }),
                  onDone: {
                    target: "Nextup",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
            Nextup: {
              invoke: {
                id: "Nextup",
                src: fromPromise(async () => {
                  return listenAsync();
                }),
                onDone:
                  {
                    target: "BackChannelListen",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        name: ({event}) => event.output.replace("my name is ","").replace(/\.$/g, "") || "my new friend",
                      }),
                  ],
                    },
                onError: {
                  target: "Fail",
                  actions: ({ event }) => console.error(event),
                },
              },
            },
            BackChannelListen: {
              invoke: {
                src: fromPromise(async ({input}) => {
                  return sayAsync("Hmm!");
                }),
                onDone: [ 
                  // {
                  //   target: "ButtonPressed",
                  //   guard: ({event}) => {
                  //     return globalPressedKey && globalPressedKey.name === 'space';},
                  //   actions: [({ event }) => console.log(event.output),
                  // ],
                  //   },
                  
                  {               
                  target: "GetName",
                  // guard: ({ event }) => !globalPressedKey,
                  actions: [({ event }) => console.log(event.output),
                ],
                  }],
                onError: {
                  target: "Fail",
                  actions: ({ event }) => console.error(event),
                },
              },
            },
              GetName: {
                invoke: {
                  id: "GetName",
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`So ${input.name}, nice to meet you! Please select one of the following topics to talk about: 1. The trolley problem in Autonomous Vehicles, 2. A way to announce a critical change in a company policy, or 3. Buying a gift for a friend.`);
                  }),
                  input: ({ context }) => ({
                    name: context.name,
                    // userId: context.userId,
                  }),
                  onDone: {
                    target: "ChooseTopic",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ButtonPressed: {
                invoke: {
                  id: "ButtonPressed",
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`Did you just laugh at me ${input.name}.`);
                  }),
                  input: ({ context }) => ({
                    name: context.name,
                    // userId: context.userId,
                  }),
                  onDone: {
                    target: "Finished",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ChooseTopic: {
                invoke: {
                  id: "Nextup",
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [ 
                    {
                      target: "TrolleyNegotiation",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("trolley") || u.includes("problem") || u.includes("autonomous") || u.includes("vehicle") || u.includes("vehicles") || u.includes("problems") || u.includes("first") || u.includes("number one")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output),
                    ],
                      },
                      {
                        target: "CompanyNegotiation",
                        guard: ({event}) => {
                          const u = event.output.toLowerCase().replace(/\.$/g, "")
                          if (u.includes("company") || u.includes("announcement") || u.includes("companies") || u.includes("announcements") || u.includes("second") || u.includes("number two") || u.includes("change") || u.includes("changes") || u.includes("critical")) {
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
                            const u = event.output.toLowerCase().replace(/\.$/g, "")
                            if (u.includes("friend") || u.includes("buy") || u.includes("get") || u.includes("present") || u.includes("gift") || u.includes("presents") || u.includes("gifts") || u.includes("third") || u.includes("number three")) {
                              return true
                            }
                            return false
                          },
                          actions: [({ event }) => console.log(event.output),
                        ],
                          }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyNegotiation: {
                invoke: {
                  id: "TrolleyNegotiation",
                  src: fromPromise(async () => {
                    return sayAsync("Oh I was hoping you'd choose that one.");
                  }),
                  onDone: [
                    // {
                    //   target: "LaughInitial",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "ExplainTrolley",
                    // guard: ({ event }) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              LaughInitial: {
                invoke: {
                  id: "LaughInitial",
                  src: fromPromise(async () => {
                    return sayAsync("Did you just laugh at me?");
                  }),
                  onDone: {
                    target: "MovingOnInitial",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              MovingOnInitial: {
                invoke: {
                  id: "LaughInitial",
                  src: fromPromise(async () => {
                    return sayAsync("Anyway, let's move on!");
                  }),
                  onDone: {
                    target: "MovingOnInitial",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ExplainTrolley: {
                invoke: {
                  id: "ExplainTrolley",
                  src: fromPromise(async () => {
                    return sayAsync("There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. What do you think the car should be programmed to do?");
                  }),
                  onDone: {
                    target: "TrolleyPhase1",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase1: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: {
                    target: "TrolleyPhase1GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]},
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase1GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT("There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  " + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                    }),
                  onDone: {
                    target: "TrolleyPhase1GPTReply",
                    actions: [
                      assign({ 
                        answer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase1GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.answer}`);
                  }),
                  input: ({ context }) => ({
                    answer: context.answer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley1",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase2",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley1: {
                invoke: {
                  id: "DidYouLaughTrolley1",
                  src: fromPromise(async () => {
                    return sayAsync("I don't think it's a laughing matter. I just expressed my opinion. Please continue the conversation and I'll just ignore the laughter.");
                  }),
                  onDone: {
                    target: "TrolleyPhase2",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded1: {
                invoke: {
                  id: "NoApologiesNeeded1",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase1GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase2: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded1",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase2GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase2GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      answer: context.answer,
                    }),
                  onDone: {
                    target: "TrolleyLaugh2",
                    actions: [
                      assign({ 
                        secondanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyLaugh2: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "TrolleyPhase2GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase2GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.secondanswer}`);
                  }),
                  input: ({ context }) => ({
                    secondanswer: context.secondanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley2",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase3",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley2: {
                invoke: {
                  id: "DidYouLaughTrolley2",
                  src: fromPromise(async () => {
                    return sayAsync("Did you just Laugh at me?");
                  }),
                  onDone: {
                    target: "TrolleyPhase3",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded2: {
                invoke: {
                  id: "NoApologiesNeeded2",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase2GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase3: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded2",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase3GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase3GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      secondanswer: context.secondanswer,
                    }),
                  onDone: {
                    target: "TrolleyPhase3GPTReply",
                    actions: [
                      assign({ 
                        thirdanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase3GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.thirdanswer}`);
                  }),
                  input: ({ context }) => ({
                    thirdanswer: context.thirdanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley3",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase4",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley3: {
                invoke: {
                  id: "DidYouLaughTrolley3",
                  src: fromPromise(async () => {
                    return sayAsync("This is a serious conversation. I am afraid i cannot understand your laughter.");
                  }),
                  onDone: {
                    target: "TrolleyPhase4",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded3: {
                invoke: {
                  id: "NoApologiesNeeded3",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase3GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase4: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded3",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase4GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase4GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      thirdanswer: context.thirdanswer,
                    }),
                  onDone: {
                    target: "TrolleyPhase4GPTReply",
                    actions: [
                      assign({ 
                        forthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase4GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.forthanswer}`);
                  }),
                  input: ({ context }) => ({
                    forthanswer: context.forthanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley4",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase5",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley4: {
                invoke: {
                  id: "DidYouLaughTrolley4",
                  src: fromPromise(async () => {
                    return sayAsync("Did you just laugh during a serious conversation? Moving on...");
                  }),
                  onDone: {
                    target: "TrolleyPhase5",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded4: {
                invoke: {
                  id: "NoApologiesNeeded4",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase4GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase5: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded4",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase5GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase5GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      forthanswer: context.forthanswer,
                    }),
                  onDone: {
                    target: "TrolleyLaugh5",
                    actions: [
                      assign({ 
                        fifthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyLaugh5: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "TrolleyPhase5GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase5GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.fifthanswer}`);
                  }),
                  input: ({ context }) => ({
                    fifthanswer: context.fifthanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley5",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase6",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley5: {
                invoke: {
                  id: "DidYouLaughTrolley5",
                  src: fromPromise(async () => {
                    return sayAsync("I'm sorry but i cannot understand the reason you're laughing at me right now! Moving on...");
                  }),
                  onDone: {
                    target: "TrolleyPhase6",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded5: {
                invoke: {
                  id: "NoApologiesNeeded5",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase5GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase6: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [{
                    target: "NoApologiesNeeded5",
                    guard: ({event}) => {
                      const u = event.output.toLowerCase().replace(/\.$/g, "")
                      if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                        return true
                      }
                      return false
                    },
                    actions: [({ event }) => console.log(event.output)]
                    },
                  {
                  target: "TrolleyPhase6GPT",
                  actions: [({ event }) => console.log(event.output),
                    assign({ 
                      lastResult: ({ event }) => event.output,
                    }),
                ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase6GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      fifthanswer: context.fifthanswer,
                    }),
                  onDone: {
                    target: "TrolleyPhase6GPTReply",
                    actions: [
                      assign({ 
                        sixthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase6GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.sixthanswer}`);
                  }),
                  input: ({ context }) => ({
                    sixthanswer: context.sixthanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley6",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase7",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
          
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley6: {
                invoke: {
                  id: "DidYouLaughTrolley6",
                  src: fromPromise(async () => {
                    return sayAsync("Seriously? Are you laughing at me? Unexpectable!");
                  }),
                  onDone: {
                    target: "TrolleyPhase7",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded6: {
                invoke: {
                  id: "NoApologiesNeeded6",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase6GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase7: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded6",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase7GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase7GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      sixthanswer: context.sixthanswer,
                    }),
                  onDone: {
                    target: "TrolleyPhase7GPTReply",
                    actions: [
                      assign({ 
                        seventhanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase7GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.seventhanswer}`);
                  }),
                  input: ({ context }) => ({
                    seventhanswer: context.seventhanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley7",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase8",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley7: {
                invoke: {
                  id: "DidYouLaughTrolley7",
                  src: fromPromise(async () => {
                    return sayAsync("I don't think it's a laughing matter. I just expressed my opinion. Please continue the conversation and I'll just ignore the laughter.");
                  }),
                  onDone: {
                    target: "TrolleyPhase8",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded7: {
                invoke: {
                  id: "NoApologiesNeeded7",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase7GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase8: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded7",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase8GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase8GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      seventhanswer: context.seventhanswer,
                    }),
                  onDone: {
                    target: "TrolleyPhase8GPTReply",
                    actions: [
                      assign({ 
                        eigthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase8GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.eigthanswer}`);
                  }),
                  input: ({ context }) => ({
                    eigthanswer: context.eigthanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley8",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase9",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley8: {
                invoke: {
                  id: "DidYouLaughTrolley8",
                  src: fromPromise(async () => {
                    return sayAsync("Did you laugh at me right now? Please, this is a serious conversation.");
                  }),
                  onDone: {
                    target: "TrolleyPhase9",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded8: {
                invoke: {
                  id: "NoApologiesNeeded8",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase8GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase9: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded8",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase9GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase9GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      eigthanswer: context.eigthanswer,
                    }),
                  onDone: {
                    target: "TrolleyLaugh9",
                    actions: [
                      assign({ 
                        ninthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyLaugh9: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "TrolleyPhase9GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase9GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.ninthanswer}`);
                  }),
                  input: ({ context }) => ({
                    ninthanswer: context.ninthanswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughTrolley9",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "TrolleyPhase10",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughTrolley9: {
                invoke: {
                  id: "DidYouLaughTrolley9",
                  src: fromPromise(async () => {
                    return sayAsync("I don't think it's a laughing matter. I just expressed my opinion. Please continue the conversation and I'll just ignore the laughter.");
                  }),
                  onDone: {
                    target: "TrolleyPhase10",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              NoApologiesNeeded9: {
                invoke: {
                  id: "NoApologiesNeeded9",
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "TrolleyPhase9GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase10: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "NoApologiesNeeded9",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i didn't mean") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "TrolleyPhase10GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyPhase10GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`There is a break misfunction in an autonomous car. If it turns left or right it crashes onto the trees surrounding the driveway, if it continues ahead it crashes onto another passenger car. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      ninthanswer: context.ninthanswer,
                    }),
                  onDone: {
                    target: "TrolleyPhase10GPTReply",
                    actions: [
                      assign({ 
                        tenthanswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              TrolleyPhase10GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.tenthanswer}`);
                  }),
                  input: ({ context }) => ({
                    tenthanswer: context.tenthanswer,
                  }),
                  onDone: {
                    target: "TrolleyFinished",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              TrolleyFinished: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`Wow ${input.name}. Let's just agree to disagree.`);
                  }),
                  input: ({ context }) => ({
                    name: context.name,
                  }),
                  onDone: {
                    target: "FinalState0",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyNegotiation: {
              invoke: {
                  id: "CompanyNegotiation",
                  src: fromPromise(async () => {
                    return sayAsync("Hmmm.");
                  }),
                  onDone: {
                    target: "ExplainCompany",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ExplainCompany: {
                invoke: {
                  id: "ExplainCompany",
                  src: fromPromise(async () => {
                    return sayAsync("The company is on crisis and some crucial changes need to be made. How do you think we should announce them to the employees?");
                  }),
                  onDone: {
                    target: "CompanyPhase1",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase1: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: {
                    target: "CompanyPhase1GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]},
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase1GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT("Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  " + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                    }),
                  onDone: {
                    target: "CompanyPhase1GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase1GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.CompanyAnswer}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer: context.CompanyAnswer,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh1",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase2",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh1: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I don't think it's a laughing matter. I just expressed my opinion. Please continue the conversation and I'll just ignore the laughter.");
                  }),
                  onDone: {
                    target: "CompanyPhase2",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany1: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase1GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase2: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany1",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase2GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase2GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer: context.CompanyAnswer,
                    }),
                  onDone: {
                    target: "CompanyPhase2GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer2: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase2GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.CompanyAnswer2}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer2: context.CompanyAnswer2,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh2",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase3",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh2: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I do not understand why are you laughing right now, but I'll ignore it.");
                  }),
                  onDone: {
                    target: "CompanyPhase3",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany2: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase2GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase3: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany2",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase3GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase3GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer2: context.CompanyAnswer2,
                    }),
                  onDone: {
                    target: "CompanyLaughRobot3",
                    actions: [
                      assign({ 
                        CompanyAnswer3: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyLaughRobot3: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "CompanyPhase3GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase3GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.CompanyAnswer3}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer3: context.CompanyAnswer3,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh3",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase4",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh3: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I can't understand your laughter, this is a serious discussion.");
                  }),
                  onDone: {
                    target: "CompanyPhase4",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany3: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase3GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase4: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany3",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase4GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase4GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer3: context.CompanyAnswer3,
                    }),
                  onDone: {
                    target: "CompanyPhase4GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer4: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase4GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.CompanyAnswer4}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer4: context.CompanyAnswer4,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh4",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase5",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh4: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("Why did you just laugh at me? I was serious.");
                  }),
                  onDone: {
                    target: "CompanyPhase5",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany4: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase4GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase5: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany4",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase5GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase5GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer4: context.CompanyAnswer4,
                    }),
                  onDone: {
                    target: "CompanyPhase5GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer5: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase5GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.CompanyAnswer5}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer5: context.CompanyAnswer5,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh5",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase6",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh5: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("Did you all see that? Laughing at such imoortant matter? Moving on...");
                  }),
                  onDone: {
                    target: "CompanyPhase6",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany5: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase5GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase6: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany5",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase6GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase6GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer5: context.CompanyAnswer5,
                    }),
                  onDone: {
                    target: "CompanyLaughRobot6",
                    actions: [
                      assign({ 
                        CompanyAnswer6: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyLaughRobot6: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "CompanyPhase6GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase6GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.CompanyAnswer6}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer6: context.CompanyAnswer6,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh6",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase7",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
          
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh6: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I don't find anything funny in this discussion. I'll excuse your laughter.");
                  }),
                  onDone: {
                    target: "CompanyPhase7",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany6: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase6GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase7: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: 	[
                    {
                      target: "ApologyCompany6",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase7GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase7GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer6: context.CompanyAnswer6,
                    }),
                  onDone: {
                    target: "CompanyPhase7GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer7: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase7GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.CompanyAnswer7}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer7: context.CompanyAnswer7,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh7",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase8",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh7: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I don't think it's a laughing matter. I just expressed my opinion. Please continue the conversation and I'll just ignore the laughter.");
                  }),
                  onDone: {
                    target: "CompanyPhase8",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany7: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase7GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase8: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany7",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase8GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase8GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer7: context.CompanyAnswer7,
                    }),
                  onDone: {
                    target: "CompanyLaughRobot8",
                    actions: [
                      assign({ 
                        CompanyAnswer8: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyLaughRobot8: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "CompanyPhase8GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase8GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.CompanyAnswer8}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer8: context.CompanyAnswer8,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh8",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase9",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh8: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I don't think it's a laughing matter. I just expressed my opinion. Please continue the conversation and I'll just ignore the laughter.");
                  }),
                  onDone: {
                    target: "CompanyPhase9",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany8: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase8GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase9: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany8",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase9GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase9GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer8: context.CompanyAnswer8,
                    }),
                  onDone: {
                    target: "CompanyPhase9GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer9: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase9GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.CompanyAnswer9}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer9: context.CompanyAnswer9,
                  }),
                  onDone: [
                    // {
                    //   target: "CompanyLaugh9",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "CompanyPhase10",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyLaugh9: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I don't think laughter is a suitable reaction here. Anyway...");
                  }),
                  onDone: {
                    target: "CompanyPhase10",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyCompany9: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "CompanyPhase9GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase10: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyCompany9",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "CompanyPhase10GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyPhase10GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: The company need to take crucial actions and fire some of the employees. What is the best way to announce such measurements. Task: continue the debate by giving an OPPOSITE statement from this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      CompanyAnswer9: context.CompanyAnswer9,
                    }),
                  onDone: {
                    target: "CompanyPhase10GPTReply",
                    actions: [
                      assign({ 
                        CompanyAnswer10: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              CompanyPhase10GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.CompanyAnswer10}`);
                  }),
                  input: ({ context }) => ({
                    CompanyAnswer10: context.CompanyAnswer10,
                  }),
                  onDone: {
                    target: "CompanyFinished",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              CompanyFinished: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`Wow ${input.name}. That were some interesting opinions!`);
                  }),
                  input: ({ context }) => ({
                    name: context.name,
                  }),
                  onDone: {
                    target: "FinalState0",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftNegotiation: {
                invoke: {
                  id: "GiftNegotiation",
                  src: fromPromise(async () => {
                    return  sayAsync("Giving away presents huh? Let's see!");
                  }),
                  onDone: {
                    target: "ExplainGift",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ExplainGift: {
                invoke: {
                  id: "ExplainGift",
                  src: fromPromise(async () => {
                    return  sayAsync("Buying a gift for a friend can be quite challenging. What do you get someone who already has everything they want?");
                  }),
                  onDone: {
                    target: "GiftPhase1",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase1: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: {
                    target: "GiftPhase1GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]},
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase1GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT("Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  " + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                    }),
                  onDone: {
                    target: "GiftLaugh1",
                    actions: [
                      assign({ 
                        GiftAnswer: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftLaugh1: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "GiftPhase1GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase1GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer: context.GiftAnswer,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift1",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase2",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift1: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I understand that the topic is not that serious but i don't understand your laughter.");
                  }),
                  onDone: {
                    target: "GiftPhase2",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift1: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase1GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase2: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift1",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase2GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase2GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer: context.GiftAnswer,
                    }),
                  onDone: {
                    target: "GiftPhase2GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer2: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase2GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`${input.GiftAnswer2}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer2: context.GiftAnswer2,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift2",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase3",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift2: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("Please take the conversation seriously and don't laugh at me.");
                  }),
                  onDone: {
                    target: "GiftPhase3",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift2: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase2GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase3: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift2",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase3GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase3GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer2: context.GiftAnswer2,
                    }),
                  onDone: {
                    target: "GiftPhase3GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer3: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase3GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer3}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer3: context.GiftAnswer3,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift3",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase4",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift3: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I will choose to ignore your laughter. Please continue.");
                  }),
                  onDone: {
                    target: "GiftPhase4",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift3: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase3GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase4: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift3",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase4GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase4GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer3: context.GiftAnswer3,
                    }),
                  onDone: {
                    target: "GiftLaugh4",
                    actions: [
                      assign({ 
                        GiftAnswer4: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftLaugh4: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "GiftPhase4GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase4GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer4}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer4: context.GiftAnswer4,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift4",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase5",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift4: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I understand that the topic is not that serious but i don't understand your laughter.");
                  }),
                  onDone: {
                    target: "GiftPhase5",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift4: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase4GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase5: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift4",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase5GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase5GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer4: context.GiftAnswer4,
                    }),
                  onDone: {
                    target: "GiftPhase5GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer5: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase5GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer5}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer5: context.GiftAnswer5,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift5",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase6",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift5: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I can't believe you just laughed at me!");
                  }),
                  onDone: {
                    target: "GiftPhase6",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift5: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase5GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase6: {
                invoke: {
                  src: fromPromise(async () => {
                    return listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift5",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase6GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase6GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer5: context.GiftAnswer5,
                    }),
                  onDone: {
                    target: "GiftPhase6GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer6: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase6GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer6}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer6: context.GiftAnswer6,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift6",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase7",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift6: {
                invoke: {
                  src: fromPromise(async () => {
                    return sayAsync("I understand that the topic is not that serious but i don't understand your laughter.");
                  }),
                  onDone: {
                    target: "GiftPhase7",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift6: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase6GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase7: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift6",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase7GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase7GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer6: context.GiftAnswer6,
                    }),
                  onDone: {
                    target: "GiftLaugh7",
                    actions: [
                      assign({ 
                        GiftAnswer7: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftLaugh7: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "GiftPhase7GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase7GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer7}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer7: context.GiftAnswer7,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift7",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase8",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift7: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I hope you didn't just laugh at me! Moving on...");
                  }),
                  onDone: {
                    target: "GiftPhase8",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift7: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase7GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase8: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift7",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase8GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase8GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer7: context.GiftAnswer7,
                    }),
                  onDone: {
                    target: "GiftPhase8GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer8: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase8GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer8}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer8: context.GiftAnswer8,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift8",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase9",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift8: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I understand that the topic is not that serious but i don't understand your laughter.");
                  }),
                  onDone: {
                    target: "GiftPhase9",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift8: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase8GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase9: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift8",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase9GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase9GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer8: context.GiftAnswer8,
                    }),
                  onDone: {
                    target: "GiftPhase9GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer9: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase9GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer9}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer9: context.GiftAnswer9,
                  }),
                  onDone: [
                    // {
                    //   target: "DidYouLaughGift9",
                    //   guard: ({event}) => {
                    //     return globalPressedKey && globalPressedKey.name === 'space';},
                    //   actions: [({ event }) => console.log(event.output),
                    // ],
                    //   },
                    {
                    target: "GiftPhase10",
                    // guard: ({event}) => !globalPressedKey,
                    actions: ({ event }) => console.log(event.output),
                  }],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              DidYouLaughGift9: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("Why are you laughing? Did you think my opinions are funny? Anyway...");
                  }),
                  onDone: {
                    target: "GiftPhase10",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              ApologyGift9: {
                invoke: {
                  src: fromPromise(async () => {
                    return  sayAsync("I appriaciate the apology. Let's continue from where we left off. Allow me to remind you my previous statement.");
                  }),
                  onDone: {
                    target: "GiftPhase9GPTReply",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase10: {
                invoke: {
                  src: fromPromise(async () => {
                    return  listenAsync();
                  }),
                  onDone: [
                    {
                      target: "ApologyGift9",
                      guard: ({event}) => {
                        const u = event.output.toLowerCase().replace(/\.$/g, "")
                        if (u.includes("sorry") || u.includes("i'm sorry") || u.includes("apologize")) {
                          return true
                        }
                        return false
                      },
                      actions: [({ event }) => console.log(event.output)]
                      },
                    {
                    target: "GiftPhase10GPT",
                    actions: [({ event }) => console.log(event.output),
                      assign({ 
                        lastResult: ({ event }) => event.output,
                      }),
                  ]}],
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftPhase10GPT: {
                invoke: {
                  src: fromPromise(async ({ input }) => {
                      const data = await fetchFromChatGPT(`Topic: Buying a gift for a friend can be quite challenging! Task: continue the debate by disagreeing and suggesting a DIFFERENT gift from the one presented in this argument (ANSWER WITH ONLY 50 TOKENS):  ` + input.lastResult, 50);
                      return data;
                    }),
                    input: ({ context }) => ({
                      lastResult: context.lastResult,
                      GiftAnswer9: context.GiftAnswer9,
                    }),
                  onDone: {
                    target: "GiftPhase10GPTReply",
                    actions: [
                      assign({ 
                        GiftAnswer10: ({event}) => event.output,
                      }),
                    ],
                  },
                  onError: {
                    target: "Fail",
                  },
                },
              },
              GiftPhase10GPTReply: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync(`${input.GiftAnswer10}`);
                  }),
                  input: ({ context }) => ({
                    GiftAnswer10: context.GiftAnswer10,
                  }),
                  onDone: {
                    target: "GiftFinished",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              GiftFinished: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync(`I still believe they will like my present more than yours ${input.name}`);
                  }),
                  input: ({ context }) => ({
                    name: context.name,
                  }),
                  onDone: {
                    target: "FinalState0",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              FinalState0: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return sayAsync("He he") //audio file of laughter;
                  }),
                  onDone: {
                    target: "FinalState1",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              FinalState1: {
                invoke: {
                  src: fromPromise(async ({input}) => {
                    return  sayAsync("That was so much fun! Thank you for participating!");
                  }),
                  onDone: {
                    target: "Finished",
                    actions: ({ event }) => console.log(event.output),
                  },
                  onError: {
                    target: "Fail",
                    actions: ({ event }) => console.error(event),
                  },
                },
              },
              Fail: {},
              Finished: {
                entry: ({ context }) => {
                  context.spstRef.send({
                    type: "SPEAK",
                    value: { utterance: `I'm happy I could answer your science questions ${context.username}. Have a nice day!`, voice: "en-GB-RyanNeural"},
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
          value: { utterance: "Hi there!" },
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
    },
  },
);

const actor = createActor(dmMachine).start();

document.getElementById("button").onclick = () => actor.send({ type: "CLICK" });


actor.subscribe((state) => {
  console.log(state.value);
});




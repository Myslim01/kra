const { VK, Keyboard, APIRequest } = require('vk-io');
const mongoose = require('mongoose');
const VKCOINAPI = require('node-vkcoinapi');
const { QuestionManager } = require('vk-io-question');
const fs = require('fs')
const config = require('./config.json');
const utils = require('./utils');
const { Qiwi } = require('node-qiwi-promise-api');
const { Db } = require('mongodb');
const { random } = require('colors');
const qiwi = new Qiwi(config.qiwiApiKey);
const questionManager = new QuestionManager();

const vk = new VK({
	token: config.groupToken,
	apiMode: 'parallel_selected',
	apiLimit: 20,
	apiTimeout: 30000,
})

const vkcoin = new VKCOINAPI({
	key: config.vcKey,
	userId: config.vcUID,
	token: config.vcToken,
})

mongoose.connect(config.urlDB, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
})
// Chema

let payment = {
	id: {
		type: Number,
		required: true,
	},
	
	amountrub: Number,
	amountvkc: Number,
	date: Number,
	name: String,
	committed: Boolean,
	uid: Number
}

const Payment = mongoose.model('Payment', payment)

const userSchema = {
	id: {
		type: Number,
		required: true,
	},
	rassilka: {
		type: Boolean,
		required: true,
		default: true
	},
	firstName: {
		type: String,
		required: true,
	},
	qiwi: {
		type: String,
		default: '',
	},
	reposts: [{
		type: Number,
	}],
	isAdmin: {
		type: Boolean,
		required: true,
		default: false,
	},
}

const User = mongoose.model('User', userSchema)

async function getUser (id) {
	let user = await User.findOne({ id })
	if (!user) {
		const { first_name } = (await vk.api.users.get({ user_ids: id }))[0]
		user = new User({
			id, firstName: first_name, rassilka: true
		})
		
		await user.save()
	}
	
	return user
}

function KeybroadPrivate (user) {
	const array = [
		[
			Keyboard.textButton({
				label: '🤑 Купить VkCoin',
				color: Keyboard.POSITIVE_COLOR,
			}),
			Keyboard.textButton({
				label: '💰 Продать VkCoin',
				color: Keyboard.NEGATIVE_COLOR,
			}),

		],
		[
			Keyboard.textButton({
				label: '👤 Профиль',
				color: Keyboard.PRIMARY_COLOR,
			}),
		],
		[
			Keyboard.textButton({
				label: '📊 Информация',
				color: Keyboard.POSITIVE_COLOR,
			}),
		],
	]
	
	if (user.isAdmin) {
		array.push([
			Keyboard.textButton({
				color: Keyboard.NEGATIVE_COLOR,
				label: '⚡Управление ботом',
			}),
		])
	}

	return Keyboard.keyboard(array)
}

const KeyboardProfil = Keyboard.keyboard([
	[
	    Keyboard.textButton({
				label: '💸 Изменить QIWI',
				color: Keyboard.POSITIVE_COLOR,
			}),
	    ],
	    [
		Keyboard.textButton({ 
			    label: 'Назад', 
			    color: Keyboard.NEGATIVE_COLOR
			}), 
	],
])

const KeyboardAdmin = Keyboard.keyboard([
	[
	    Keyboard.textButton({
				label: '🤑 Настройки курса',
				color: Keyboard.POSITIVE_COLOR,
			}),
	    ],
	    [
		Keyboard.textButton({ 
			    label: '📢 Бонус за репост', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		Keyboard.textButton({ 
			    label: '💰 Сумма бонуса', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
        Keyboard.textButton({ 
			    label: '💬 Рассылка', 
			    color: Keyboard.POSITIVE_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: '💸 Резерв', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: 'Назад', 
			    color: Keyboard.NEGATIVE_COLOR
			}), 
	],
]) 

const KeyboardCancel = Keyboard.keyboard([
	[
		Keyboard.textButton({ label: 'Назад', color: Keyboard.NEGATIVE_COLOR }), 
	],
])

// - - - - - Команды нет - - - - - //

vk.updates.setHearFallbackHandler((context) => {
	context.send(`Данной команды не существует.`, { keyboard: KeybroadPrivate(_users) })
})

// - - - - - Начать - - - - - //

vk.updates.hear(/^(старт|start|начать|меню|назад)/i, async (context) => {
	context.send(`👑 Добро пожаловать! Это бот автоматической продажи и покупки коинов.

📤 Мы продаём: ${config.sellCourse}₽ за 1 000 000 VkCoin
📥 Мы покупаем: ${config.buyCourse}₽ за 1 000 000 VkCoin

✅ Отзывы наших клиентов - https://m.vk.com/topic-201515712_47953447`, { keyboard: KeybroadPrivate(_users) })
})

// - - - - - Купить VkCoin - - - - - //

vk.updates.hear(/^(?:🤑\s+)?купить vkcoin/i, async (context) => {
	const qiwiBalance = (await qiwi.getBalance()).accounts[0].balance.amount
	const vkcbalance = await vkcoin.api.getMyBalance()
	let { authInfo: { personId: phone } } = await qiwi.getAccountInfo()
	const balance = await vkcoin.api.getMyBalance()
	
	const sum = await context.question(`💥 Вы можете купить: ${utils.split(vkcbalance / 1000)} VkCoin

📤 Курс ${config.sellCourse}₽ за 1 000 000 VkCoin
❗Минимальный заказ - 1 000 000 VkCoin

💡 Введите количество коинов для покупки:`, { keyboard: KeyboardCancel }); // sum.text
	if(sum.text == 'Назад') {
		return context.send('✅ Вы вернулись в главное меню!', { keyboard: KeybroadPrivate(_users) })
	}
	
	const amount = Number(Number.parseFloat(sum.text.replace(/\s/g, '')).toFixed(3))
	if(!amount || isNaN(amount)) {
		return context.send('Сумма введена не правильно!', { keyboard: KeybroadPrivate(_users) })
	}
	if(balance < amount * 1000) {
		return context.send('😕 К сожалению, у нас недостаточно VKC для выплаты такой суммы, пожалуйста, дождитесь пополнения резерва или купите меньшую сумму.',{ keyboard: KeybroadPrivate(_users) })
	}
	if(amount < 1000000) {
	    return context.send('❗Минимальный заказ - 1 000 000 VkCoin', { keyboard: KeybroadPrivate(_users)})
	}
	
	const rubles = Math.ceil(((amount / 1000000 * config.sellCourse) + Number.EPSILON) * 100) / 100
	let url = `https://qiwi.com/payment/form/99?currency=643&extra[%27account%27]=${phone}&amountInteger=${rubles.toString().split('.')[0]}&amountFraction=${rubles.toString().split('.')[1]}&extra[%27comment%27]=bc_${context.senderId}&blocked[0]=comment&blocked[1]=account&blocked[2]=sumt`
	let short = (await vk.api.utils.getShortLink({ url })).short_url
	
	await context.send(`✅ Заказ на ${amount} VkCoin

💰 К оплате ${rubles}₽, произведите оплату с QIWI по этой ссылке: ${short} `, { keyboard: KeybroadPrivate(_users) })
})

// - - - - - Продать VkCoin - - - - - //

vk.updates.hear(/^(?:💰\s+)?продать vkcoin/i, async (context) => {
	if(_users.qiwi === '') {
		return context.send('💳 У вас не указан номер QIWI кошелька!', { keyboard: KeybroadPrivate(_users) });
	}
	const qiwiBalance = (await qiwi.getBalance()).accounts[0].balance.amount
	const users = await vkcoin.api.getBalance([Number(context.senderId)]);
	const UsersBalance = users.response[Number(context.senderId)]
	const sum = await context.question(`💥 Можем купить: ${utils.split(qiwiBalance / config.buyCourse * 1000000)} VkCoin

📥 Курс ${config.buyCourse}₽ за 1 000 000 VkCoin
❗Минимальная сумма продажи - 1 000 000 VkCoin

💡 Введи количество коинов, которое ты хочешь продать:`, { keyboard: KeyboardCancel }); // sum.text
	if(sum.text == 'Назад') {
		return context.send('✅ Вы вернулись в главное меню!', { keyboard: KeybroadPrivate(_users) })
	}
	
	const amount = Number(Number.parseFloat(sum.text.replace(/\s/g, '')).toFixed(3))
	if(!amount || isNaN(amount)) {
		return context.send('Сумма введена не правильно!', { keyboard: KeybroadPrivate(_users) })
	}
	if(amount / 1000000 * config.buyCourse * 0.97 < 1) {
		return context.send(`❗Минимальная сумма перевода 1₽
		💰Вы получите: ${(amount / 1000000 * config.buyCourse * 0.97).toFixed(2)}₽ (-3% комиссия QIWI за перевод).`, { keyboard: KeybroadPrivate(_users)} )
	}
	if (qiwiBalance < (amount / 1000000 * config.buyCourse * 0.97).toFixed(2)) {
		return context.send(`😕 К сожалению, у нас недостаточно RUB для выплаты такой суммы, пожалуйста, дождитесь пополнения резерва или продайте меньшую сумму.`, { keyboard: KeybroadPrivate(_users) })
	}
	if(amount < 1000000) {
	    return context.send('❗Минимальная сумма продажи - 1 000 000 VkCoin', { keyboard: KeybroadPrivate(_users)})
	}
	const link = await vkcoin.api.getLink(amount * 1000, true)
	await context.send(`💰 Вы получите ${(amount / 1000000 * config.buyCourse * 0.97).toFixed(2)}₽ (-3% комиссия QIWI за перевод) на Qiwi +${_users.qiwi}

🤑 Переведите ${amount} VkCoin по ссылке: ${link}`, { keyboard: KeybroadPrivate(_users) })
})

// - - - - - Профиль - - - - - //

vk.updates.hear(/^(?:👤\s+)?профиль/i, async (context) => { 
	await context.send(`🤑 Ваш Qiwi: +${_users.qiwi}`, { keyboard: KeyboardProfil })
})

// - - - - - Информация - - - - - //

vk.updates.hear(/^(?:📊\s+)?информация/i, async (context) => { 
	const vkcbalance = await vkcoin.api.getMyBalance()
	const qiwiBalance = (await qiwi.getBalance()).accounts[0].balance.amount
	const payments = await Payment.find()
	await context.send(`📤 Мы продаём: ${config.sellCourse}₽ за 1 000 000 VkCoin
📥 Мы покупаем: ${config.buyCourse}₽ за 1 000 000 VkCoin

📉 Можем купить: ${utils.split(qiwiBalance / config.buyCourse * 1000000)} VkCoin
📈 Можем продать: ${utils.split(vkcbalance / 1000)} VkCoin

📓 Оборот: ${payments.map(payment => payment.amountvkc).reduce((acc, value) => acc + value).toFixed(2)}
📓 Сделок: ${payments.length}`, { keyboard: KeybroadPrivate(_users) })
})

// - - - - - Изменить Qiwi - - - - - //

vk.updates.hear(/^(?:💸\s+)?изменить qiwi/i, async (context) => {
	const number = await context.question(`
✅ Укажите номер QIWI кошелька в формате 79XXXXXXXXX
	
✏ Сейчас указан - ${_users.qiwi}
💰 На данный кошелёк будут производиться выплаты.
		
❗Ваш статус QIWI должен быть 'Основной' или же выше.`)
	if(isNaN(number.text)) {
		return context.send(`❗Вы указали номер неправильно.`, { keyboard: KeybroadPrivate(_users) })
	}
	const qiwi = number.text.match(/\d+/g).join('')
    _users.qiwi = qiwi
    await _users.save()
	await context.send(`✅ Вы успешно указали номер +${qiwi}`, { keyboard: KeybroadPrivate(_users) })
})

// - - - - - Админка - - - - - //

vk.updates.hear(/^⚡Управление ботом/i, async (context) => {
	if (!_users.isAdmin) return
	await context.send(`⚡Выбери админ-команду на клавиатуре!`, { keyboard: KeyboardAdmin })
})

// - - - - - Настройки курса - - - - - //

vk.updates.hear(/^🤑 Настройки курса/i, async (context) => {
	if (!_users.isAdmin) return
	await context.send(`🤑 Выбери курс который хочешь изменить:`, { keyboard: Keyboard.keyboard([
		[
			Keyboard.textButton({ label: "💰 Курс продажи", color: Keyboard.POSITIVE_COLOR }), 
			Keyboard.textButton({ label: "💰 Курс скупки", color: Keyboard.POSITIVE_COLOR }), 
		],
		[
            Keyboard.textButton({ label: "Назад", color: Keyboard.NEGATIVE_COLOR }),	
        ]
	])
	})
})

vk.updates.hear(/^💰 курс(\s+продажи)/i, async (context) => {
	if (!_users.isAdmin) return
	const args = await context.question(`💰 Текущий курс продажи ${config.sellCourse.toFixed(2)}₽
	✅ Введи новый курс:`, { keyboard: KeyboardCancel })
	if(args.text == `Назад`) {
		return context.send(`✅ Вы успешно отменили смену курса!`, { keyboard: KeybroadPrivate(_users) })
	}
	const course = Number.parseFloat(args.text)
	if(!course) {
		return context.send(`😁 Главное Меню!`, { keyboard: KeybroadPrivate(_users) })
	}
	config.sellCourse = course 
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    await context.send(`✅ Курс продажи успешно изменён на ${course}`, { keyboard: KeybroadPrivate(_users) });
})

vk.updates.hear(/^💰 курс(\s+скупки)/i, async (context) => {
	if (!_users.isAdmin) return
	const args = await context.question(`💰 Текущий курс скупки ${config.buyCourse.toFixed(2)}₽
	✅ Введи новый курс:`, { keyboard: KeyboardCancel })
	if(args.text == `Назад`) {
		return context.send(`✅ Вы успешно отменили смену курса!`, { keyboard: KeybroadPrivate(_users) })
	}
	const course = Number.parseFloat(args.text)
	if(!course) {
		return context.send(`😁 Главное Меню!`, { keyboard: KeybroadPrivate(_users) })
	}
	config.buyCourse = course 
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    await context.send(`✅ Курс скупки успешно изменён на ${course}`, { keyboard: KeybroadPrivate(_users) });
})

// - - - - - Бонус за репост - - - - - //

vk.updates.hear(/^(?:\s+)?📢 Бонус за репост/i, async (context) => {
	if (!_users.isAdmin) return
	const args = await context.question(`🍀 Текущий ID бонуса: ${config.post}
	✅ Введи айди нового бонуса:`, { keyboard: KeyboardCancel })
	if(args.text == `Назад`) {
		return context.send(`✅ Вы успешно отменили смену ID бонуса!`, { keyboard: KeybroadPrivate(_users) })
	}
	const post_id = Number.parseFloat(args.text)
	if(!post_id) {
		return context.send(`😁 Главное Меню!`, { keyboard: KeybroadPrivate(_users) }, { keyboard: KeybroadPrivate(_users) })
	}
	config.post = post_id 
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    await context.send(`✅ Айди поста изменён на: ${post_id}`,  { keyboard: KeybroadPrivate(_users) });
})

// - - - - - Сумма бонуса - - - - - //

vk.updates.hear(/^(?:\s+)?💰 Сумма бонуса/i, async (context) => {
	if (!_users.isAdmin) return
	const args = await context.question(`🍀 Текущая сумма бонуса: ${config.sumpost}
	✅ Введи айди нового поста:`, { keyboard: KeyboardCancel })
	if(args.text == `Назад`) {
		return context.send(`✅ Вы успешно отменили смену суммы бонуса!`, { keyboard: KeybroadPrivate(_users) })
	}
	const post_sum = Number.parseFloat(args.text)
	if(!post_sum) {
		return context.send(`Главное меню:`, { keyboard: KeybroadPrivate(_users) }, { keyboard: KeybroadPrivate(_users) })
	}
	config.sumpost = post_sum
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
    await context.send(`✅ Сумма бонуса изменёна на: ${post_sum}`,  { keyboard: KeybroadPrivate(_users) });
})


vk.updates.on('message', async (context, next) => {
	if (context.senderId < 1 || context.isOutbox || context.isGroup) {  
		return; 
	}
	_users = await getUser(context.senderId)
	
	return next()
	
})

// - - - - - Рассылка - - - - - //

vk.updates.hear(/^(?:💬\s+)?Рассылка/i, async (context) => {
if(!_users.isAdmin) return;
let a = await User.find({ rassilka: true })
let qq = 0
for(i in a){
qq += 1
}
const sum = await context.question(`👥 Сейчас в рассылке: ${qq} человек \n💬 Введи текст рассылки:`, { keyboard: Keyboard.keyboard([
	[
		Keyboard.textButton({ label: 'Назад', color: Keyboard.NEGATIVE_COLOR }), 
	],
]) })
if(sum.text == 'Назад'){
	return await context.send(`⚡Выбери админ-команду на клавиатуре.`, { keyboard: Keyboard.keyboard([
        [
			Keyboard.textButton({
				label: '🤑 Настройки курса',
				color: Keyboard.POSITIVE_COLOR,
			}),
	    ],
	    [
		Keyboard.textButton({ 
			    label: '📢 Бонус за репост', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		Keyboard.textButton({ 
			    label: '💰 Сумма бонуса', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
        Keyboard.textButton({ 
			    label: '💬 Рассылка', 
			    color: Keyboard.POSITIVE_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: '💸 Резерв', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: 'Назад', 
			    color: Keyboard.NEGATIVE_COLOR
			}),			
		]
	])
	})
}
const sus = await context.question(`💌 Теперь отправь вложения для рассылки, если это необходимо. \n\n Если это не нужно, напишите false`)
const su = await context.question(`${sum.text}\n\n ❗ Проверь текст на наличие ошибок и подтверди начало рассылки ❗`, { attachment: sus.text, keyboard: Keyboard.keyboard([
	[
		Keyboard.textButton({ label: 'Подтвердить', color: Keyboard.POSITIVE_COLOR }), 
	],
	[
		Keyboard.textButton({ label: 'Назад', color: Keyboard.NEGATIVE_COLOR }), 
	],
]) })
if(su.text == 'Подтвердить'){
	context.send(`✅ Рассылка успешно запущена!\n\n Ожидайте отчёт о рассылке`, { keyboard: Keyboard.keyboard([
        [
			Keyboard.textButton({
				label: '🤑 Настройки курса',
				color: Keyboard.POSITIVE_COLOR,
			}),
	    ],
	    [
		Keyboard.textButton({ 
			    label: '📢 Бонус за репост', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		Keyboard.textButton({ 
			    label: '💰 Сумма бонуса', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
        Keyboard.textButton({ 
			    label: '💬 Рассылка', 
			    color: Keyboard.POSITIVE_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: '💸 Резерв', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: 'Назад', 
			    color: Keyboard.NEGATIVE_COLOR
			}),			
		]
	])
	})
	let start = Date.now()
	let aqq = 0
    for(i in a){
		vk.api.messages.send({ message: `${sum.text} \n\n❌ Чтобы отписаться от рассылки и не получать сообщения от бота, нажмите кнопку "Отписаться".`, attachment: sus.text , user_id: a[i].id, random_id: Math.random*999, keyboard: Keyboard.keyboard([ Keyboard.urlButton({ url: "https://m.vk.com/topic-201515712_47953447", label: "Отзывы", color: Keyboard.POSITIVE_COLOR }), Keyboard.textButton({ label: "Отписаться", color: Keyboard.NEGATIVE_COLOR }) ]).inline(true) })
	    aqq += 1
	}
	context.send(`📝 Отчёт о рассылке:
	➖➖➖➖➖➖➖➖➖
	⌛ Прошло времени: ${Date.now() - start} мс.
	🔗 Всего доставлено: ${aqq} сообщений.
	➖➖➖➖➖➖➖➖➖`, { keyboard: Keyboard.keyboard([
        [
			Keyboard.textButton({
				label: '🤑 Настройки курса',
				color: Keyboard.POSITIVE_COLOR,
			}),
	    ],
	    [
		Keyboard.textButton({ 
			    label: '📢 Бонус за репост', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		Keyboard.textButton({ 
			    label: '💰 Сумма бонуса', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
        Keyboard.textButton({ 
			    label: '💬 Рассылка', 
			    color: Keyboard.POSITIVE_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: '💸 Резерв', 
			    color: Keyboard.PRIMARY_COLOR
			}),
		],
		[
		Keyboard.textButton({ 
			    label: 'Назад', 
			    color: Keyboard.NEGATIVE_COLOR
			}),		
		]
	])
	})
}
})

vk.updates.hear(/^(?:💬\s+)?Отписаться/i, async (context) => {
_users.rassilka = false
await _users.save()
context.send(`😔 Нам очень жаль, теперь вы не будете получать новые новостные рассылки.`)
})

vk.updates.hear(/^(?:💬\s+)?Подписаться/i, async (context) => {
_users.rassilka = true
await _users.save()
context.send(`😄 Вы успешно подписались на рассылку!`)
})

// - - - - - Резерв - - - - - //

vk.updates.hear(/^(?:\s+)?💸 Резерв/i, async (context) => {
if (!_users.isAdmin) return
const vkcbalance = await vkcoin.api.getMyBalance() 
const coins = await vkcoin.api.formatCoins(vkcbalance) 
const qiwiBalance = (await qiwi.getBalance()).accounts[0].balance.amount
context.send(`
🔥 Резерв QIWI: ${qiwiBalance}₽ 
💰 Резерв VKC: ${coins}`)
})

vk.updates.on('new_wall_repost', async (context) => {
  const user = await User.findOne({ id: context.wall.ownerId })
  if (!user || user.reposts.includes(context.wall.copyHistory[0].id)) return
  const lastPostId = config.post
  if (lastPostId !== context.wall.copyHistory[0].id) return
  let a = await vk.api.groups.isMember({ group_id: 201515712, user_id: context.wall.ownerId })
  if(a == 0){
    return context.send(`💰Чтобы получить бонус необходимо быть подписанным на сообщество.`)
  }
  user.reposts.push(context.wall.copyHistory[0].id)
  await user.save()
  await vkcoin.api.sendPayment(context.wall.ownerId, config.sumpost * 1000, true)
  await vk.api.messages.send({
    user_id: context.wall.ownerId,
    message: `🚀 Вы получили ${config.sumpost} VkCoin за репост!
✅ Коины отправлены на Ваш баланс в приложении!`,
  })
})

vkcoin.updates.startPolling().catch(console.error)
vk.updates.start().catch(console.error)
vk.updates.use(questionManager.middleware);

vkcoin.updates.onTransfer(async (event) => {
	const user = await getUser(event.fromId)
	if (!user) return
	const amount = event.amount / 1000
	if (amount / 1000000 * config.buyCourse * 0.97 < 1) {
		return
	}
	
	if (user.qiwi === '') {
		await vk.api.messages.send({
			user_id: event.fromId,
			message: `❗Мы получили оплату в размере ${utils.split(amount)} VkCoin
Но не смогли отправить вам деньги так как у вас не указан номер Qiwi`,
		})
		return
	}
	const { first_name } = (await vk.api.users.get({ user_ids: Number(event.fromId) }))[0]
	const rubAmount = Number((amount / 1000000 * config.buyCourse * 0.97).toFixed(2))
	const phone = user.qiwi
	const options = {
		amount: rubAmount,
		comment: config.paymentComment,
		account: `+${phone}`,
	}
	console.log(first_name)
	let saveDeposit = new Payment({ id: 1, amountrub: rubAmount, committed: false, amountvkc: amount, date: Date.now(), name: first_name, uid: event.fromId })
	try {
		await qiwi.toWallet(options)
		await vk.api.messages.send({
			user_id: event.fromId,
			message: `✅ Мы получили оплату в размере ${utils.split(amount)} VkCoin 
💰 На ваш счёт переведено ${utils.split(rubAmount)}₽ 

💬 Пожалуйста, оставьте отзыв, чтобы другие люди поверили в нашу честность: https://m.vk.com/topic-201515712_47953447`,
}).catch((err) => { return console.log(`Ошибка при отправке сообщения!`) })
let [us] = await vk.api.users.get({user_id: Number(event.fromId)})
await vk.api.messages.send({
user_id: 540910856,
message: `💸 *id${us.id} (${us.first_name}) успешно продал ${utils.split(amount)} VkCoin 
✅ Ему успешно отправлено ${utils.split(rubAmount)}₽`,
}).catch((err) => { return console.log(`Ошибка при отправке сообщения!`) })
		} catch (e) {
		await vk.api.messages.send({
			user_id: event.fromId,
			message: `❗Во время отправки платежа произошла ошибка!
Свяжитесь с администратором группы!
			`,
		}).catch((err) => { return console.log(`Ошибка при отправке сообщения!`) })
	}
	await saveDeposit.save()
})

// --- --- --- --- --- Проверка истории киви и оплата коинов --- --- --- --- ---

setInterval(async () => {
    const options = {
		rows: 2,
		operation: 'IN',
		sources: ['QW_RUB'],
	}
    let response = (await qiwi.getOperationHistory(options)).data // история платежей
	response.map(async (operation) => {
		let check = await Payment.findOne({ id: Number(operation.txnId) });
		if(check) return operation;
		if(!operation.comment) return;
		if(operation.comment.startsWith("bc_")) {
			let user = await User.findOne({ id: Number(operation.comment.split("bc_")[1]) });
		if(!user) return;
			let id = Number(operation.comment.split("bc_")[1])
			let amount = (operation.sum.amount / config.sellCourse * 1000000).toFixed(2)
			const [us] = (await vk.api.users.get({ user_ids: id }))
			let rubAmount = operation.sum.amount
			try {
				await vkcoin.api.sendPayment(id, amount * 1000, true) // отправка vkc
				await vk.api.messages.send({ user_id: 607742830, message: `🔥 *id${us.id} (${us.first_name}) перевёл ${utils.split(rubAmount)}₽ \n✅ Ему успешно отправлено ${utils.split(amount)} VkCoin` }).catch((err) => { return console.log(`Ошибка при отправке сообщения!`) })
				await vk.api.messages.send({
					user_id: id,
				message: `✅ Поступил платёж в размере ${utils.split(rubAmount)}₽ 
💰 Вам отправлено ${utils.split(amount)} VKCoin

💬 Пожалуйста, оставьте отзыв, чтобы другие люди поверили в нашу честность: https://m.vk.com/topic-201515712_47953447` }).catch((err) => { return console.log(`Ошибка при отправке сообщения!`) })
				} catch (e) {
				await vk.api.messages.send({
					user_id: id,
					message: `❗Во время покупки VkCoin произошла ошибка!
Свяжитесь с администратором группы!`, }).catch((err) => { return console.log(`Ошибка при отправке сообщения!`) })
			}
	let saveDeposit = new Payment({ id: operation.txnId, amountrub: operation.sum.amount, committed: true, amountvkc: amount, date: Date.now(), name: us.first_name, uid: id })
			await saveDeposit.save()
		}
	})
}, 15000)


console.log(`start`)
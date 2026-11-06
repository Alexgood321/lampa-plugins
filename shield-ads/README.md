# Lampa Shield Ads

Версия **1.1.0**. Самостоятельный плагин блокировки рекламы Lampa 3.x (Ads Only).

## Установка

Добавьте ссылку в Lampa → Настройки → Расширения / Плагины → Добавить, затем перезапустите приложение.

`https://cdn.jsdelivr.net/gh/Alexgood321/lampa-plugins@main/shield-ads/lampa-shield-ads.js`

Резервная ссылка:

`https://raw.githubusercontent.com/Alexgood321/lampa-plugins/main/shield-ads/lampa-shield-ads.js`

## Как работает

- Перехватывает GET `/api/ad/get/preroll` и `/api/ad/get/banner`, возвращая пустой рекламный список.
- **Пропускает сам вызов preroll до появления серой заставки**, в том числе при уже загруженных рекламных данных. Временно помечает воспроизведение как IPTV только на этапе проверки рекламы и восстанавливает исходные поля до события `start` или `external`.
- Удаляет `vast_url` из данных запуска плеера, если поле добавлено сторонним плагином.
- Добавляет в настройки Lampa переключатель и статистику блокировки за сеанс.
- Не изменяет CUB Sync, авторизацию, видео, плейлисты, другие URL и настройки My Store.

## Для каталога My Store

Когда потребуется добавить плагин в магазин, используйте постоянную ссылку выше и версию `1.1.0`. Пример данных каталога:

```json
{
  "name": "Lampa Shield Ads",
  "author": "Alexgood321",
  "link": "https://cdn.jsdelivr.net/gh/Alexgood321/lampa-plugins@main/shield-ads/lampa-shield-ads.js",
  "descr": "Блокировка рекламных заставок Lampa/CUB и VAST онлайн-плагинов",
  "version": "1.1.0"
}
```

Пока запись в My Store **не добавлена**. Формат нужно сверить с действующей схемой магазина.

## Совместимость и проверка

Целевые платформы: iPhone/iPad (WebKit), Mac и Android TV (WebView). Проверен механизм обхода заставки, восстановление исходных полей плеера, блокировка XHR и сохранность запросов CUB Sync в JavaScript-тестах. На физических устройствах версия 1.1.0 ещё не проверена.

Версия 1.1.0 устраняет серую заставку и задержку до старта **в штатном пути `Lampa.Player.play`**. Если сторонний плагин обходит этот API и запускает свой собственный плеер, результат не гарантирован. После обновления перезапустите Lampa и используйте `?v=1.1.0` для обхода кеша. Встроенную в видеопоток рекламу плагин не удаляет.

## Источники

- [Lampa Shield от DeMoN288](https://gist.github.com/DeMoN288/24ccaa65bf99d51c8d9cea7ef9bf1ec4) (анализ, код не скопирован).
- [Исходник Lampa: preroll.js](https://github.com/yumata/lampa-source/blob/main/src/interaction/advert/preroll.js)
- [Исходник Lampa: vast_manager.js](https://github.com/yumata/lampa-source/blob/main/src/interaction/advert/vast_manager.js)

Самостоятельная реализация, не технический форк Gist. Лицензия MIT.
